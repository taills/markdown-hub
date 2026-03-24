import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocument } from '@/hooks/useDocument';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/useAuth';
import { useSiteTitle } from '@/hooks/useSiteTitle';
import { useImagePaste } from '@/hooks/useImagePaste';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { SnapshotPanel } from '@/components/SnapshotPanel';
import { PermissionsPanel } from '@/components/PermissionsPanel';
import { AttachmentPanel } from '@/components/AttachmentPanel';
import { CommentsPanel } from '@/components/CommentsPanel';
import { ErrorModal } from '@/components/ErrorModal';
import { attachmentService, documentService } from '@/services/api';
import { applyLinePatch, createLinePatch } from '@/utils/linePatch';
import type { Attachment, WSMessage } from '@/types';

type Panel = 'preview' | 'history' | 'permissions' | 'attachments' | 'comments';

export function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { siteTitle } = useSiteTitle();
  const { document, setDocument, isLoading, error } = useDocument(id ?? '');

  const [content, setContent] = useState('');
  const [activePanel, setActivePanel] = useState<Panel>('preview');
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState('');
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<{ scrollToLine: (line: number) => void }>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef('');
  const lastSyncedContentRef = useRef('');

  const setContentFromServer = useCallback((nextContent: string) => {
    setContent(nextContent);
    contentRef.current = nextContent;
    lastSyncedContentRef.current = nextContent;
  }, []);

  const setContentLocal = useCallback((nextContent: string) => {
    setContent(nextContent);
    contentRef.current = nextContent;
  }, []);

  useEffect(() => {
    if (document) setContentFromServer(document.content);
  }, [document, setContentFromServer]);

  const handleWSMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'init' || msg.type === 'update') {
      if (msg.content !== undefined) setContentFromServer(msg.content);
    }
    if (msg.type === 'patch' && msg.payload) {
      const nextContent = applyLinePatch(contentRef.current, msg.payload);
      setContentFromServer(nextContent);
    }
    if ((msg.type === 'update' || msg.type === 'patch') && msg.user_id && msg.user_id !== user?.id) {
      setCollaborators((prev) =>
        prev.includes(msg.user_id!) ? prev : [...prev, msg.user_id!]
      );
    }
  }, [setContentFromServer, user?.id]);

  const { send, connectionState: wsState, reconnect } = useWebSocket({
    documentId: id ?? '',
    token: token ?? '',
    onMessage: handleWSMessage,
  });

  useEffect(() => {
    setConnectionState(wsState);
  }, [wsState]);

  const sendPendingPatch = useCallback(() => {
    if (!id) return;
    const patch = createLinePatch(lastSyncedContentRef.current, contentRef.current);
    if (!patch) return;
    send({ type: 'patch', payload: patch });
    lastSyncedContentRef.current = contentRef.current;
  }, [id, send]);

  // Listen for input event to sync on typing
  const handleContentChange = useCallback(
    (newContent: string) => {
      setContentLocal(newContent);
      // Debounce: send WebSocket patch 500ms after last keystroke.
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(sendPendingPatch, 500);
    },
    [sendPendingPatch, setContentLocal]
  );

  const handleInsertAttachment = useCallback(async (attachment: Attachment) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const isImage = attachment.file_type?.startsWith('image/');
    const label = attachment.filename || 'attachment';
    const downloadUrl = attachment.document_id
      ? `/api/attachments/${attachment.id}/download`
      : `/api/workspace-attachments/${attachment.id}/download`;
    const markdown = isImage
      ? `![${label}](${attachment.file_path})`
      : `[${label}](${downloadUrl})`;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent =
      content.substring(0, start) + markdown + content.substring(end);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setContentLocal(newContent);
    sendPendingPatch();

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + markdown.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
  }, [content, sendPendingPatch, setContentLocal]);

  // Handle image paste
  const { attachPasteListener } = useImagePaste({
    onImagePaste: async ({ file }) => {
      if (!id) return;

      try {
        // Upload the image
        const attachment = await attachmentService.upload(id, file);

        // Insert markdown image reference into content
        // Format: ![alt text](attachment-path)
        const imageMD = `![${file.name}](${attachment.file_path})`;
        const textarea = textareaRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newContent =
            content.substring(0, start) + imageMD + content.substring(end);
          handleContentChange(newContent);
        }
      } catch (err) {
        console.error('Failed to upload pasted image:', err);
      }
    },
  });

  // Attach paste listener to textarea
  useEffect(() => {
    if (textareaRef.current) {
      return attachPasteListener(textareaRef.current);
    }
  }, [attachPasteListener]);

  // Ctrl+S: explicit snapshot.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        sendPendingPatch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sendPendingPatch]);

  const togglePublic = async () => {
    if (!document || !id) return;
    try {
      const updated = await documentService.setPublic(id, !document.is_public);
      setDocument(updated);
    } catch (err) {
      console.error('Failed to toggle public status:', err);
    }
  };

  const viewRaw = () => {
    if (!id) return;
    window.open(`/api/documents/${id}/raw`, '_blank');
  };

  if (isLoading) return <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-neutral-400">Loading document…</div>;
  if (error) {
    const modalError = error !== dismissedError ? error : '';
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-neutral-900">
        <header className="flex items-center gap-3 px-4 py-3 border-b bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700">
          <button className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-700" onClick={() => navigate('/')}>← Documents</button>
          <h2 className="text-sm font-medium text-gray-800 dark:text-neutral-200">{siteTitle}</h2>
        </header>
        <ErrorModal
          message={modalError}
          onClose={() => {
            setDismissedError(error);
            navigate('/');
          }}
        />
      </div>
    );
  }
  if (!document) return null;

  const wsStatusClass = connectionState === 'connected'
    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
    : connectionState === 'error' || connectionState === 'disconnected'
    ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-neutral-900">
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 shrink-0">
        <button className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-700" onClick={() => navigate('/')}>
          ← Documents
        </button>
        <h2 className="text-sm font-medium text-gray-800 dark:text-neutral-200 truncate max-w-[200px]">{document.title}</h2>
        <div className="flex items-center gap-2 ms-auto">
          <button
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-700"
            onClick={togglePublic}
          >
            {document.is_public ? '🌐 Public' : '🔒 Private'}
          </button>
          <button
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-700"
            onClick={viewRaw}
          >
            📄 Raw
          </button>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${wsStatusClass}`}>
            {connectionState}
          </span>
          {(connectionState === 'error' || connectionState === 'disconnected') && (
            <button
              onClick={reconnect}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-700"
              title="Manually reconnect WebSocket"
            >
              🔄 Reconnect
            </button>
          )}
          {collaborators.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-neutral-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="7" r="4"/><path d="M5.5 21v-2a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4v2" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
              {collaborators.length} online
            </span>
          )}
        </div>
        <div className="flex rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden ms-2">
          {(['preview', 'history', 'permissions', 'attachments', 'comments'] as Panel[]).map((p) => (
            <button
              key={p}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                activePanel === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-700 border-s border-gray-200 dark:border-neutral-700'
              }`}
              onClick={() => setActivePanel(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <textarea
          ref={textareaRef}
          className="flex-1 w-full p-4 border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          spellCheck={false}
        />
        <div className="w-80 border-s border-gray-200 dark:border-neutral-700 overflow-y-auto">
          {activePanel === 'preview' && (
            <MarkdownPreview
              ref={previewRef}
              content={content}
            />
          )}
          {activePanel === 'history' && (
            <SnapshotPanel documentId={document.id} onRestore={(doc) => {
              setDocument(doc);
              setContent(doc.content);
            }} />
          )}
          {activePanel === 'permissions' && (
            <PermissionsPanel documentId={document.id} />
          )}
          {activePanel === 'attachments' && (
            <AttachmentPanel
              documentId={document.id}
              onInsert={handleInsertAttachment}
            />
          )}
          {activePanel === 'comments' && (
            <CommentsPanel documentId={document.id} />
          )}
        </div>
      </div>
    </div>
  );
}

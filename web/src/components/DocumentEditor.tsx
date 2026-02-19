import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocument } from '@/hooks/useDocument';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/useAuth';
import { useImagePaste } from '@/hooks/useImagePaste';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { SnapshotPanel } from '@/components/SnapshotPanel';
import { PermissionsPanel } from '@/components/PermissionsPanel';
import { AttachmentPanel } from '@/components/AttachmentPanel';
import { ErrorModal } from '@/components/ErrorModal';
import { attachmentService, documentService } from '@/services/api';
import { applyLinePatch, createLinePatch } from '@/utils/linePatch';
import type { Attachment, WSMessage } from '@/types';

type Panel = 'preview' | 'history' | 'permissions' | 'attachments';

export function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { document, setDocument, isLoading, error } = useDocument(id ?? '');

  const [content, setContent] = useState('');
  const [activePanel, setActivePanel] = useState<Panel>('preview');
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState('');
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const { send, connectionState: wsState } = useWebSocket({
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
  }, [content, send]);

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

  if (isLoading) return <div className="loading">Loading document…</div>;
  if (error) {
    const modalError = error !== dismissedError ? error : '';
    return (
      <div className="editor-layout">
        <header className="editor-header">
          <button className="back-btn" onClick={() => navigate('/')}>⟵ Documents</button>
          <h2 className="doc-title">MarkdownHub</h2>
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

  return (
    <div className="editor-layout">
      <header className="editor-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          &larr; Documents
        </button>
        <h2 className="doc-title">{document.title}</h2>
        <div className="toolbar">
          <button onClick={togglePublic}>
            {document.is_public ? '🌐 Public' : '🔒 Private'}
          </button>
          <button onClick={viewRaw}>📄 Raw</button>
          <span className={`ws-status ws-${connectionState}`}>{connectionState}</span>
          {collaborators.length > 0 && (
            <span className="collaborators">{collaborators.length} online</span>
          )}
          <button
            className={activePanel === 'preview' ? 'active' : ''}
            onClick={() => setActivePanel('preview')}
          >
            Preview
          </button>
          <button
            className={activePanel === 'history' ? 'active' : ''}
            onClick={() => setActivePanel('history')}
          >
            History
          </button>
          <button
            className={activePanel === 'permissions' ? 'active' : ''}
            onClick={() => setActivePanel('permissions')}
          >
            Permissions
          </button>
          <button
            className={activePanel === 'attachments' ? 'active' : ''}
            onClick={() => setActivePanel('attachments')}
          >
            Attachments
          </button>
        </div>
      </header>

      <div className="editor-body">
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          spellCheck={false}
        />
        <div className="editor-panel">
          {activePanel === 'preview' && <MarkdownPreview content={content} />}
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
              workspaceId={document.workspace_id}
              onInsert={handleInsertAttachment}
            />
          )}
        </div>
      </div>
    </div>
  );
}

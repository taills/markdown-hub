import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useSiteTitle } from '@/hooks/useSiteTitle';
import { useDocument, useDocumentList } from '@/hooks/useDocument';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useImagePaste } from '@/hooks/useImagePaste';
import { useToast } from '@/components/Toast';
import { attachmentService, documentService } from '@/services/api';
import { MarkdownPreview, type MarkdownPreviewRef } from '@/components/MarkdownPreview';
import { SnapshotPanel } from '@/components/SnapshotPanel';
import { PermissionsPanel } from '@/components/PermissionsPanel';
import { AttachmentPanel } from '@/components/AttachmentPanel';
import { SearchModal } from '@/components/SearchModal';
import { ErrorModal } from '@/components/ErrorModal';
import { TreeDocumentList } from '@/components/TreeDocumentList';
import { applyLinePatch, createLinePatch } from '@/utils/linePatch';
import type { Attachment, DocumentListItem, WSMessage } from '@/types';

// ---------------------------------------------------------------------------

type Panel = 'preview' | 'history' | 'permissions' | 'attachments';

type Column = 'documents' | 'preview';

type ResizableColumn = 'documents' | 'preview';

const RESIZER_WIDTH = 12;
const MIN_DOCUMENTS_WIDTH = 220;
const MIN_PREVIEW_WIDTH = 260;
const MIN_EDITOR_WIDTH = 420;
const COLUMN_WIDTHS_STORAGE_KEY = 'markdownhub_column_widths';

const DEFAULT_WIDTHS: Record<ResizableColumn, number> = {
  documents: 280,
  preview: 360,
};

export function NotesLayout() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user, logout, token } = useAuth();
  const { siteTitle } = useSiteTitle();
  const { showToast } = useToast();
  const { documents, isLoading: docsLoading, reload } = useDocumentList();
  const { document, setDocument, isLoading: docLoading, error: documentError } = useDocument(id ?? '');

  const [content, setContent] = useState('');
  const [activePanel, setActivePanel] = useState<Panel>('preview');
  const [mode] = useState<'edit' | 'settings'>('edit');
  const [visibleColumns, setVisibleColumns] = useState<Record<Column, boolean>>({
    documents: true,
    preview: true,
  });

  // Cursor tracking for preview sync
  const [currentLine, setCurrentLine] = useState(1);
  const previewRef = useRef<MarkdownPreviewRef>(null);

  // Load column widths from localStorage
  const loadColumnWidths = useCallback((): Record<ResizableColumn, number> => {
    try {
      const saved = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          documents: Math.max(MIN_DOCUMENTS_WIDTH, parsed.documents || DEFAULT_WIDTHS.documents),
          preview: Math.max(MIN_PREVIEW_WIDTH, parsed.preview || DEFAULT_WIDTHS.preview),
        };
      }
    } catch (e) {
      console.warn('Failed to load column widths from localStorage:', e);
    }
    return DEFAULT_WIDTHS;
  }, []);

  const [columnWidths, setColumnWidths] = useState<Record<ResizableColumn, number>>(loadColumnWidths);
  const [containerWidth, setContainerWidth] = useState(0);
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState('disconnected');
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef('');
  const lastSyncedContentRef = useRef('');
  const resizeRef = useRef<{
    type: ResizableColumn;
    startX: number;
    startWidths: Record<ResizableColumn, number>;
    containerWidth: number;
  } | null>(null);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState('');
  const [publicToggling, setPublicToggling] = useState(false);
  const [dismissedDocError, setDismissedDocError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const docErrorToShow = documentError && documentError !== dismissedDocError ? documentError : '';
  const modalError = titleError || docErrorToShow;
  const handleCloseError = () => {
    if (documentError) setDismissedDocError(documentError);
    setTitleError('');
  };

  // Save column widths to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths));
    } catch (e) {
      console.warn('Failed to save column widths to localStorage:', e);
    }
  }, [columnWidths]);

  // Track container width for calculating editor column width
  useEffect(() => {
    const updateContainerWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateContainerWidth();
    window.addEventListener('resize', updateContainerWidth);
    return () => window.removeEventListener('resize', updateContainerWidth);
  }, []);

  // Scroll preview to current cursor position
  useEffect(() => {
    if (activePanel === 'preview' && previewRef.current) {
      previewRef.current.scrollToLine(currentLine);
    }
  }, [currentLine, activePanel]);

  // Keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    if (!document) setContentFromServer('');
  }, [document, setContentFromServer]);

  useEffect(() => {
    if (!document) {
      setTitleDraft('');
      setIsEditingTitle(false);
      setTitleError('');
      return;
    }
    setTitleDraft(document.title);
    setIsEditingTitle(false);
    setTitleError('');
  }, [document?.id, document?.title]);

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
      if (!id) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(sendPendingPatch, 500);
    },
    [id, sendPendingPatch, setContentLocal]
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
  }, [content, id, send]);

  const { attachPasteListener } = useImagePaste({
    onImagePaste: async ({ file }) => {
      if (!id) return;
      try {
        const attachment = await attachmentService.upload(id, file);
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

  useEffect(() => {
    if (textareaRef.current) {
      return attachPasteListener(textareaRef.current);
    }
  }, [attachPasteListener]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!id) return;
        sendPendingPatch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [id, sendPendingPatch]);

  const activeDocPermission = useMemo(() => {
    if (!id) return null;
    return documents.find((doc) => doc.id === id)?.permission ?? null;
  }, [documents, id]);

  const canEditTitle = useMemo(() => {
    if (!document) return false;
    if (document.owner_id === user?.id) return true;
    return activeDocPermission === 'edit' || activeDocPermission === 'manage';
  }, [activeDocPermission, document, user?.id]);

  const canManageDoc = useMemo(() => {
    if (!document) return false;
    if (document.owner_id === user?.id) return true;
    return activeDocPermission === 'manage';
  }, [activeDocPermission, document, user?.id]);

  const handleDeleteDocument = async (doc: DocumentListItem) => {
    if (!confirm(t('doc.deleteConfirm'))) return;
    await documentService.delete(doc.id)
      .then(() => {
        showToast(t('doc.deletedSuccess'), 'success');
      })
      .catch(() => {
        showToast(t('doc.deleteFailed'), 'error');
      });
    reload();
    if (id === doc.id) navigate('/');
  };

  const handleRenameDocument = async (doc: DocumentListItem, newTitle: string) => {
    try {
      await documentService.updateTitle(doc.id, newTitle);
      showToast(t('doc.renameSuccess'), 'success');
      reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };

  const saveTitle = async () => {
    if (!document || titleSaving) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleError(t('doc.titleEmpty'));
      return;
    }
    if (nextTitle === document.title) {
      setIsEditingTitle(false);
      setTitleError('');
      return;
    }
    setTitleSaving(true);
    setTitleError('');
    try {
      const updated = await documentService.updateTitle(document.id, nextTitle);
      setDocument(updated);
      setTitleDraft(updated.title);
      setIsEditingTitle(false);
      reload();
    } catch (e: unknown) {
      setTitleError(e instanceof Error ? e.message : t('doc.updateTitleFailed'));
    } finally {
      setTitleSaving(false);
    }
  };

  const cancelTitleEdit = () => {
    if (!document) return;
    setTitleDraft(document.title);
    setIsEditingTitle(false);
    setTitleError('');
  };

  const handleToggleDocPublic = async () => {
    if (!document || publicToggling) return;
    setPublicToggling(true);
    try {
      const updated = await documentService.setPublic(document.id, !document.is_public);
      setDocument(updated);
    } catch (e: unknown) {
      console.error(e instanceof Error ? e.message : t('doc.togglePublicFailed'));
    } finally {
      setPublicToggling(false);
    }
  };

  const handleCopyPublicLink = () => {
    if (!document) return;
    const link = `${window.location.origin}/documents/${document.id}/view`;
    navigator.clipboard.writeText(link).then(() => {
      showToast(t('doc.linkCopied'), 'success');
    }).catch(() => {
      showToast(t('doc.linkCopyFailed'), 'error');
    });
  };

  const handleViewRaw = () => {
    if (!document) return;
    window.open(`/api/documents/${document.id}/raw`, '_blank');
  };

  const toggleColumn = (column: Column) => {
    setVisibleColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const startResize = useCallback((type: ResizableColumn, event: React.MouseEvent) => {
    event.preventDefault();
    resizeRef.current = {
      type,
      startX: event.clientX,
      startWidths: { ...columnWidths },
      containerWidth: containerRef.current?.offsetWidth ?? 0,
    };
    window.document.body.classList.add('is-resizing');
  }, [columnWidths]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!resizeRef.current) return;
      const { type, startX, startWidths, containerWidth } = resizeRef.current;

      const delta = event.clientX - startX;

      const hasDocuments = visibleColumns.documents;
      const hasPreview = visibleColumns.preview;
      const hasLeftColumn = hasDocuments;
      const resizerCount = (hasLeftColumn ? 1 : 0)
        + (hasPreview ? 1 : 0);
      const resizerTotal = resizerCount * RESIZER_WIDTH;

      const documentsWidth = hasDocuments ? startWidths.documents : 0;
      const previewWidth = hasPreview ? startWidths.preview : 0;

      const clamp = (value: number, min: number, max: number) => {
        if (Number.isFinite(max)) return Math.max(min, Math.min(value, max));
        return Math.max(min, value);
      };

      if (type === 'documents' && hasDocuments) {
        const maxWidth = containerWidth - resizerTotal - previewWidth - MIN_EDITOR_WIDTH;
        const nextWidth = clamp(
          startWidths.documents + delta,
          MIN_DOCUMENTS_WIDTH,
          maxWidth
        );
        setColumnWidths((prev) => ({ ...prev, documents: nextWidth }));
        return;
      }

      if (type === 'preview' && hasPreview) {
        const maxWidth = containerWidth - resizerTotal - documentsWidth - MIN_EDITOR_WIDTH;
        const nextWidth = clamp(
          startWidths.preview + delta,
          MIN_PREVIEW_WIDTH,
          maxWidth
        );
        setColumnWidths((prev) => ({ ...prev, preview: nextWidth }));
      }
    };

    const handleUp = () => {
      if (resizeRef.current) {
        resizeRef.current = null;
        window.document.body.classList.remove('is-resizing');
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [visibleColumns, columnWidths]);

  const columnsStyle = useMemo(() => {
    const columns: string[] = [];
    const isSettingsMode = mode === 'settings';
    const hasDocuments = visibleColumns.documents && !isSettingsMode;
    const hasPreview = visibleColumns.preview && !isSettingsMode;
    const hasEditor = !isSettingsMode;
    const hasLeftColumn = hasDocuments;

    const resizerCount = (hasLeftColumn ? 1 : 0) + (hasPreview ? 1 : 0);
    const resizersTotal = resizerCount * RESIZER_WIDTH;
    const sideColumnsTotal = (hasDocuments ? columnWidths.documents : 0) + (hasPreview ? columnWidths.preview : 0);
    const editorWidth = Math.max(MIN_EDITOR_WIDTH, containerWidth - sideColumnsTotal - resizersTotal);

    if (hasDocuments) columns.push(`${columnWidths.documents}px`);
    if (hasLeftColumn && hasEditor) columns.push(`${RESIZER_WIDTH}px`);
    if (hasEditor) columns.push(`${editorWidth}px`);
    if (hasPreview) columns.push(`${RESIZER_WIDTH}px`, `${columnWidths.preview}px`);
    if (isSettingsMode) columns.push(`minmax(${MIN_EDITOR_WIDTH}px, 1fr)`);
    return {
      gridTemplateColumns: columns.join(' '),
    } as React.CSSProperties;
  }, [visibleColumns, columnWidths, mode, containerWidth]);

  return (
    <div className="editor-layout">
      {/* Topbar */}
      <header className="app-topbar flex items-center h-14 px-4 shrink-0 gap-4">
        {/* Left: Logo + Doc Title */}
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <span className="app-logo shrink-0">
            {siteTitle}
          </span>
          {document && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-500 dark:text-neutral-400 text-sm truncate max-w-[200px]">
                {document.title}
              </span>
              {canEditTitle && !isEditingTitle && (
                <button
                  className="shrink-0 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1 py-0.5 rounded"
                  onClick={() => setIsEditingTitle(true)}
                  title={t('doc.editTitle')}
                >
                  {t('doc.editTitle')}
                </button>
              )}
              {isEditingTitle && (
                <div className="flex items-center gap-1">
                  <input
                    className="h-7 px-2 text-sm border border-gray-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-gray-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    type="text"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTitle();
                      if (e.key === 'Escape') cancelTitleEdit();
                    }}
                    onBlur={saveTitle}
                    disabled={titleSaving}
                    aria-label={t('doc.titleLabel')}
                  />
                  <button
                    className="shrink-0 h-7 px-2 text-xs border border-gray-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-600"
                    onClick={saveTitle}
                    disabled={titleSaving}
                  >
                    {t('doc.save')}
                  </button>
                  <button
                    className="shrink-0 h-7 px-2 text-xs border border-gray-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-600"
                    onClick={cancelTitleEdit}
                    disabled={titleSaving}
                  >
                    {t('doc.cancel')}
                  </button>
                </div>
              )}
            </div>
          )}
          {!document && (
            <span className="text-sm text-gray-500 dark:text-neutral-400">
              {t('doc.noneSelected')}
            </span>
          )}
        </div>

        {/* Center: Toggle buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="nav-group">
            <button
              className={`nav-btn ${visibleColumns.documents ? 'active' : ''}`}
              onClick={() => toggleColumn('documents')}
              disabled={mode === 'settings'}
            >
              {t('nav.documents')}
            </button>
            <button
              className={`nav-btn ${visibleColumns.preview ? 'active' : ''}`}
              onClick={() => toggleColumn('preview')}
              disabled={mode === 'settings'}
            >
              {t('nav.previewPanel')}
            </button>
          </div>
          <div className="nav-group">
            {(['preview', 'history', 'permissions', 'attachments'] as Panel[]).map((p) => (
              <button
                key={p}
                className={`nav-btn ${activePanel === p ? 'active' : ''}`}
                onClick={() => setActivePanel(p)}
                disabled={mode === 'settings'}
              >
                {t(`nav.${p}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="topbar-right">
          <button
            className="icon-btn"
            onClick={() => setSearchOpen(true)}
            title={t('search.title', '搜索文档')}
            aria-label={t('search.title', '搜索文档')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>

          {document && mode === 'edit' && (
            <div className="flex items-center gap-1">
              {canManageDoc && (
                <button
                  className={`icon-btn ${document.is_public ? 'success' : ''}`}
                  onClick={handleToggleDocPublic}
                  disabled={publicToggling}
                  title={document.is_public ? t('doc.setPrivate') : t('doc.setPublic')}
                  aria-label={document.is_public ? t('doc.setPrivate') : t('doc.setPublic')}
                >
                  {document.is_public ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="2" y1="12" x2="22" y2="12"/>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  )}
                </button>
              )}
              {document.is_public && (
                <button
                  className="icon-btn"
                  onClick={handleCopyPublicLink}
                  title={t('doc.publicLink')}
                  aria-label={t('doc.publicLink')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                </button>
              )}
              <button
                className="icon-btn"
                onClick={handleViewRaw}
                title={t('doc.viewRaw')}
                aria-label={t('doc.viewRaw')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </button>
            </div>
          )}

          {id && (
            <span className={`ws-status ${connectionState === 'connected' ? 'connected' : connectionState === 'connecting' ? 'connecting' : 'disconnected'}`}>
              {connectionState === 'connected' ? t('common.connected') : connectionState === 'connecting' ? t('common.connecting') : t('common.disconnected')}
            </span>
          )}
          {collaborators.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-neutral-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="7" r="4"/>
                <path d="M5.5 21v-2a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4v2" fill="none" stroke="currentColor" strokeWidth="2"/>
              </svg>
              {collaborators.length} {t('common.online')}
            </span>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/home')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span className="hidden sm:inline">{t('nav.home')}</span>
          </button>
          <button
            className="user-btn"
            onClick={() => navigate('/me')}
          >
            <span className="user-avatar">
              {user?.username?.charAt(0).toUpperCase()}
            </span>
            <span className="hidden sm:inline">
              {user?.username}
              {user?.is_admin && <span className="text-amber-500 ml-0.5">★</span>}
            </span>
          </button>
          <button
            className="btn btn-ghost text-slate-600 dark:text-slate-300"
            onClick={logout}
            title={t('nav.logout')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>{t('nav.logout')}</span>
          </button>
        </div>
      </header>

      {/* Main Columns */}
      <div
        className="editor-main"
        style={columnsStyle}
        ref={containerRef}
      >
        {mode === 'edit' && visibleColumns.documents && (
          <>
            <aside className="panel flex flex-col min-h-0">
              <div className="panel-header">
                <h3 className="panel-title">
                  {t('nav.documents')}
                </h3>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={reload}
                  disabled={docsLoading}
                >
                  {t('common.refresh')}
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <TreeDocumentList
                  documents={documents ?? []}
                  selectedId={id}
                  currentUserId={user?.id}
                  locale={i18n.language}
                  onSelect={(doc) => navigate(`/documents/${doc.id}`)}
                  onDelete={handleDeleteDocument}
                  onRename={handleRenameDocument}
                  onCreateChild={async (parentId, title) => {
                    try {
                      const doc = await documentService.create(title, '', parentId);
                      reload();
                      showToast(t('doc.createdSuccess'), 'success');
                      navigate(`/documents/${doc.id}`);
                    } catch (e) {
                      showToast(e instanceof Error ? e.message : 'Error', 'error');
                    }
                  }}
                  onMove={async (docId, newParentId, newSortOrder) => {
                    try {
                      await documentService.move(docId, newParentId, newSortOrder);
                      reload();
                      showToast(t('doc.movedSuccess'), 'success');
                    } catch (e) {
                      showToast(e instanceof Error ? e.message : 'Error', 'error');
                    }
                  }}
                  onReorder={async (_docId, _newSortOrder) => {
                    reload();
                  }}
                />
              </div>
            </aside>
            <div
              className="resizer"
              role="separator"
              aria-label="调整左侧列表宽度"
              onMouseDown={(e) => startResize('documents', e)}
            />
          </>
        )}

        {mode === 'edit' && (
          <main className="panel flex flex-col min-h-0 min-w-0">
            {docLoading && (
              <div className="flex items-center justify-center flex-1">
                <div className="loading-container">
                  <div className="spinner"></div>
                  <p className="text-sm text-gray-500 dark:text-neutral-400">{t('common.loading')}</p>
                </div>
              </div>
            )}
            {!docLoading && !document && (
              <div className="empty-state flex-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="empty-state-icon">
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <p className="empty-state-title">{t('doc.pickPrompt')}</p>
              </div>
            )}
            {!docLoading && document && (
              <textarea
                ref={textareaRef}
                className="flex-1 w-full p-4 font-mono text-sm resize-y"
                style={{ border: 'none', outline: 'none', background: 'transparent' }}
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                onSelect={(e) => {
                  const textarea = e.target as HTMLTextAreaElement;
                  const cursorPos = textarea.selectionStart;
                  const textBefore = textarea.value.substring(0, cursorPos);
                  const line = (textBefore.match(/\n/g) || []).length + 1;
                  setCurrentLine(line);
                }}
                onClick={(e) => {
                  const textarea = e.target as HTMLTextAreaElement;
                  const cursorPos = textarea.selectionStart;
                  const textBefore = textarea.value.substring(0, cursorPos);
                  const line = (textBefore.match(/\n/g) || []).length + 1;
                  setCurrentLine(line);
                }}
                spellCheck={false}
              />
            )}
          </main>
        )}

        {mode === 'edit' && visibleColumns.preview && (
          <>
            <div
              className="resizer"
              role="separator"
              aria-label="调整预览宽度"
              onMouseDown={(e) => startResize('preview', e)}
            />
            <aside className="panel flex flex-col min-h-0">
              {activePanel === 'preview' && (
                document
                  ? <MarkdownPreview ref={previewRef} content={content} currentLine={currentLine} />
                  : <div className="empty-state flex-1 text-sm text-gray-500 dark:text-neutral-400">{t('doc.previewEmpty')}</div>
              )}
              {activePanel === 'history' && (
                document
                  ? <SnapshotPanel documentId={document.id} onRestore={(doc) => {
                    setDocument(doc);
                    setContent(doc.content);
                  }} />
                  : <div className="empty-state flex-1 text-sm text-gray-500 dark:text-neutral-400">{t('doc.historyEmpty')}</div>
              )}
              {activePanel === 'permissions' && (
                document
                  ? <PermissionsPanel documentId={document.id} />
                  : <div className="empty-state flex-1 text-sm text-gray-500 dark:text-neutral-400">{t('doc.permissionsEmpty')}</div>
              )}
              {activePanel === 'attachments' && (
                document
                  ? <AttachmentPanel
                      documentId={document.id}
                      onInsert={handleInsertAttachment}
                    />
                  : <div className="empty-state flex-1 text-sm text-gray-500 dark:text-neutral-400">{t('doc.attachmentsEmpty')}</div>
              )}
            </aside>
          </>
        )}
      </div>

      <ErrorModal message={modalError} onClose={handleCloseError} />
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

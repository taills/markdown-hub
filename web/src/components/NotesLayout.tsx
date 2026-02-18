import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useDocument, useDocumentList } from '@/hooks/useDocument';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useImagePaste } from '@/hooks/useImagePaste';
import { attachmentService, documentService, workspaceService } from '@/services/api';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { SnapshotPanel } from '@/components/SnapshotPanel';
import { PermissionsPanel } from '@/components/PermissionsPanel';
import { AttachmentPanel } from '@/components/AttachmentPanel';
import { WorkspaceSettingsPanel } from '@/components/WorkspaceSettingsPanel';
import { applyLinePatch, createLinePatch } from '@/utils/linePatch';
import type { Attachment, DocumentListItem, Workspace, WSMessage } from '@/types';

type Panel = 'preview' | 'history' | 'permissions' | 'attachments';

type Column = 'workspace' | 'documents' | 'preview';

type ResizableColumn = 'workspace' | 'documents' | 'preview';

const RESIZER_WIDTH = 6;
const MIN_EDITOR_WIDTH = 420;
const MIN_WIDTHS: Record<ResizableColumn, number> = {
  workspace: 180,
  documents: 220,
  preview: 260,
};

export function NotesLayout() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user, logout, token } = useAuth();
  const { documents, isLoading: docsLoading, reload } = useDocumentList();
  const { document, setDocument, isLoading: docLoading, error: documentError } = useDocument(id ?? '');

  const [content, setContent] = useState('');
  const [activePanel, setActivePanel] = useState<Panel>('preview');
  const [mode, setMode] = useState<'edit' | 'settings'>('edit');
  const [visibleColumns, setVisibleColumns] = useState<Record<Column, boolean>>({
    workspace: true,
    documents: true,
    preview: true,
  });
  const [columnWidths, setColumnWidths] = useState<Record<ResizableColumn, number>>({
    workspace: 240,
    documents: 300,
    preview: 360,
  });
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
  } | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [creatingDocument, setCreatingDocument] = useState(false);
  const [createDocError, setCreateDocError] = useState('');
  const [showAllWorkspaces, setShowAllWorkspaces] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState('');
  const [publicToggling, setPublicToggling] = useState(false);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setWorkspaceLoading(true);
    workspaceService
      .list()
      .then((data) => {
        if (!isMounted) return;
        setWorkspaces(data ?? []);
        const initialId = data?.[0]?.id || '';
        setSelectedWorkspaceId((prev) => prev || initialId);
      })
      .catch((e: Error) => setWorkspaceError(e.message))
      .finally(() => setWorkspaceLoading(false));
    return () => {
      isMounted = false;
    };
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

  const workspaceMap = useMemo(() => {
    const map = new Map<string, Workspace>();
    workspaces.forEach((ws) => map.set(ws.id, ws));
    return map;
  }, [workspaces]);

  const selectedWorkspace = useMemo(() => {
    return workspaces.find((ws) => ws.id === selectedWorkspaceId);
  }, [workspaces, selectedWorkspaceId]);

  const handleWorkspaceUpdated = useCallback((updated: { id: string; name: string; is_public: boolean }) => {
    setWorkspaces((prev) =>
      prev.map((ws) => (ws.id === updated.id ? { ...ws, name: updated.name, is_public: updated.is_public } : ws))
    );
  }, []);

  const filteredDocuments = useMemo(() => {
    if (showAllWorkspaces || !selectedWorkspaceId) return documents;
    return (documents ?? []).filter((doc) => doc.workspace_id === selectedWorkspaceId);
  }, [documents, selectedWorkspaceId, showAllWorkspaces]);

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

  const handleCreateDocument = async () => {
    if (!newTitle.trim()) return;
    if (!selectedWorkspaceId) {
      setCreateDocError(t('workspace.none'));
      return;
    }
    setCreatingDocument(true);
    setCreateDocError('');
    try {
      const doc = await documentService.create(newTitle.trim(), '', selectedWorkspaceId);
      setNewTitle('');
      reload();
      navigate(`/documents/${doc.id}`);
    } catch (e: unknown) {
      setCreateDocError(e instanceof Error ? e.message : 'Error');
    } finally {
      setCreatingDocument(false);
    }
  };

  const handleDeleteDocument = async (doc: DocumentListItem) => {
    if (!confirm(t('doc.deleteConfirm'))) return;
    await documentService.delete(doc.id).catch(() => null);
    reload();
    if (id === doc.id) navigate('/');
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    setCreatingWorkspace(true);
    setWorkspaceError('');
    try {
      const ws = await workspaceService.create(newWorkspaceName.trim());
      setWorkspaces((prev) => [ws, ...prev]);
      setSelectedWorkspaceId(ws.id);
      setNewWorkspaceName('');
    } catch (e: unknown) {
      setWorkspaceError(e instanceof Error ? e.message : 'Error');
    } finally {
      setCreatingWorkspace(false);
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
      setPublicLinkCopied(true);
      setTimeout(() => setPublicLinkCopied(false), 2000);
    });
  };

  const handleViewRaw = () => {
    if (!document) return;
    window.open(`/api/documents/${document.id}/raw`, '_blank');
  };

  const toggleColumn = (column: Column) => {
    setVisibleColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const startResize = useCallback((type: ResizableColumn) => {
    return (event: React.MouseEvent) => {
      event.preventDefault();
      resizeRef.current = {
        type,
        startX: event.clientX,
        startWidths: { ...columnWidths },
      };
      window.document.body.classList.add('is-resizing');
    };
  }, [columnWidths]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!resizeRef.current) return;
      const containerWidth = containerRef.current?.offsetWidth ?? 0;
      if (!containerWidth) return;

      const { type, startX, startWidths } = resizeRef.current;
      const delta = event.clientX - startX;

      const hasWorkspace = visibleColumns.workspace;
      const hasDocuments = visibleColumns.documents;
      const hasPreview = visibleColumns.preview;
      const hasLeftColumn = hasWorkspace || hasDocuments;
      const hasWorkspaceDocsHandle = hasWorkspace && hasDocuments;
      const resizerCount = (hasWorkspaceDocsHandle ? 1 : 0)
        + (hasLeftColumn ? 1 : 0)
        + (hasPreview ? 1 : 0);
      const resizerTotal = resizerCount * RESIZER_WIDTH;

      const workspaceWidth = hasWorkspace ? startWidths.workspace : 0;
      const documentsWidth = hasDocuments ? startWidths.documents : 0;
      const previewWidth = hasPreview ? startWidths.preview : 0;

      const clamp = (value: number, min: number, max: number) => {
        if (Number.isFinite(max)) return Math.max(min, Math.min(value, max));
        return Math.max(min, value);
      };

      if (type === 'workspace' && hasWorkspace) {
        const maxWidth = containerWidth - resizerTotal - documentsWidth - previewWidth - MIN_EDITOR_WIDTH;
        const nextWidth = clamp(
          startWidths.workspace + delta,
          MIN_WIDTHS.workspace,
          maxWidth
        );
        setColumnWidths((prev) => ({ ...prev, workspace: nextWidth }));
        return;
      }

      if (type === 'documents' && hasDocuments) {
        const maxWidth = containerWidth - resizerTotal - workspaceWidth - previewWidth - MIN_EDITOR_WIDTH;
        const nextWidth = clamp(
          startWidths.documents + delta,
          MIN_WIDTHS.documents,
          maxWidth
        );
        setColumnWidths((prev) => ({ ...prev, documents: nextWidth }));
        return;
      }

      if (type === 'preview' && hasPreview) {
        const maxWidth = containerWidth - resizerTotal - workspaceWidth - documentsWidth - MIN_EDITOR_WIDTH;
        const nextWidth = clamp(
          startWidths.preview - delta,
          MIN_WIDTHS.preview,
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
  }, [visibleColumns]);

  const columnsStyle = useMemo(() => {
    const columns: string[] = [];
    const isSettingsMode = mode === 'settings';
    const hasWorkspace = visibleColumns.workspace;
    const hasDocuments = visibleColumns.documents && !isSettingsMode;
    const hasPreview = visibleColumns.preview && !isSettingsMode;
    const hasEditor = !isSettingsMode;
    const hasLeftColumn = hasWorkspace || hasDocuments;
    const hasWorkspaceDocsHandle = hasWorkspace && hasDocuments;

    if (hasWorkspace) columns.push(`${columnWidths.workspace}px`);
    if (hasWorkspaceDocsHandle) columns.push(`${RESIZER_WIDTH}px`);
    if (hasDocuments) columns.push(`${columnWidths.documents}px`);
    if (hasLeftColumn && hasEditor) columns.push(`${RESIZER_WIDTH}px`);
    if (hasEditor) columns.push(`minmax(${MIN_EDITOR_WIDTH}px, 1fr)`);
    if (hasPreview) columns.push(`${RESIZER_WIDTH}px`, `${columnWidths.preview}px`);
    if (isSettingsMode) columns.push(`minmax(${MIN_EDITOR_WIDTH}px, 1fr)`);
    return {
      gridTemplateColumns: columns.join(' '),
    } as React.CSSProperties;
  }, [visibleColumns, columnWidths, mode]);

  return (
    <div className="notes-shell">
      <header className="notes-topbar">
        <div className="topbar-left">
          <span className="app-title">MarkdownHub</span>
          <div className="doc-title-wrap">
            {!document && <span className="doc-title">{t('doc.noneSelected')}</span>}
            {document && !isEditingTitle && (
              <span className="doc-title" title={document.title}>{document.title}</span>
            )}
            {document && isEditingTitle && (
              <div className="doc-title-edit">
                <input
                  className="doc-title-input"
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
                <div className="doc-title-actions">
                  <button
                    className="doc-title-btn"
                    onClick={saveTitle}
                    disabled={titleSaving}
                  >
                    {t('doc.save')}
                  </button>
                  <button
                    className="doc-title-btn ghost"
                    onClick={cancelTitleEdit}
                    disabled={titleSaving}
                  >
                    {t('doc.cancel')}
                  </button>
                </div>
              </div>
            )}
            {document && canEditTitle && !isEditingTitle && (
              <button
                className="doc-title-btn ghost"
                onClick={() => setIsEditingTitle(true)}
                title={t('doc.editTitle')}
              >
                {t('doc.editTitle')}
              </button>
            )}
          </div>
          {titleError && <span className="doc-title-error">{titleError}</span>}
        </div>

        <div className="topbar-center">
          <div className="menu-group">
            <button
              className={visibleColumns.workspace ? 'active' : ''}
              onClick={() => toggleColumn('workspace')}
            >
              {t('nav.workspace')}
            </button>
            <button
              className={visibleColumns.documents ? 'active' : ''}
              onClick={() => toggleColumn('documents')}
              disabled={mode === 'settings'}
            >
              {t('nav.documents')}
            </button>
            <button
              className={visibleColumns.preview ? 'active' : ''}
              onClick={() => toggleColumn('preview')}
              disabled={mode === 'settings'}
            >
              {t('nav.previewPanel')}
            </button>
          </div>
          <div className="menu-group">
            <button
              className={activePanel === 'preview' ? 'active' : ''}
              onClick={() => setActivePanel('preview')}
              disabled={mode === 'settings'}
            >
              {t('nav.preview')}
            </button>
            <button
              className={activePanel === 'history' ? 'active' : ''}
              onClick={() => setActivePanel('history')}
              disabled={mode === 'settings'}
            >
              {t('nav.history')}
            </button>
            <button
              className={activePanel === 'permissions' ? 'active' : ''}
              onClick={() => setActivePanel('permissions')}
              disabled={mode === 'settings'}
            >
              {t('nav.permissions')}
            </button>
            <button
              className={activePanel === 'attachments' ? 'active' : ''}
              onClick={() => setActivePanel('attachments')}
              disabled={mode === 'settings'}
            >
              {t('nav.attachments')}
            </button>
          </div>
        </div>

        <div className="topbar-right">
          {document && mode === 'edit' && (
            <div className="menu-group doc-visibility-group">
              {canManageDoc && (
                <button
                  className={`ghost doc-public-btn ${document.is_public ? 'public' : 'private'}`}
                  onClick={handleToggleDocPublic}
                  disabled={publicToggling}
                  title={document.is_public ? t('doc.setPrivate') : t('doc.setPublic')}
                >
                  {document.is_public ? `🌐 ${t('doc.setPublic')}` : `🔒 ${t('doc.setPrivate')}`}
                </button>
              )}
              {document.is_public && (
                <button
                  className="ghost"
                  onClick={handleCopyPublicLink}
                  title={t('doc.publicLink')}
                >
                  {publicLinkCopied ? t('doc.publicLinkCopied') : t('doc.publicLink')}
                </button>
              )}
              <button className="ghost" onClick={handleViewRaw} title={t('doc.viewRaw')}>
                {t('doc.viewRaw')}
              </button>
            </div>
          )}
          {id && (
            <span className={`ws-pill ws-${connectionState}`}>
              {connectionState}
            </span>
          )}
          {collaborators.length > 0 && (
            <span className="collaborators">{collaborators.length} {t('common.online')}</span>
          )}
          <span className="user-chip">{user?.username}</span>
          <button className="ghost" onClick={() => navigate('/me')}>{t('nav.profile')}</button>
          <button className="ghost" onClick={logout}>{t('nav.logout')}</button>
        </div>
      </header>

      <div className="notes-columns" style={columnsStyle} ref={containerRef}>
        {visibleColumns.workspace && (
          <aside className="notes-column workspace-column">
            <div className="column-header">
              <div>
                <h3>{t('workspace.title')}</h3>
                <p className="muted">{t('workspace.folders')}</p>
              </div>
            </div>
            {workspaceError && <p className="error">{workspaceError}</p>}
            <div className="workspace-list">
              <button
                className={`workspace-item ${showAllWorkspaces ? 'active' : ''}`}
                onClick={() => setShowAllWorkspaces(true)}
              >
                {t('workspace.all')}
              </button>
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className={`workspace-item ${!showAllWorkspaces && selectedWorkspaceId === ws.id ? 'active' : ''}`}
                >
                  <button
                    className="workspace-main"
                    onClick={() => {
                      setMode('edit');
                      setShowAllWorkspaces(false);
                      setSelectedWorkspaceId(ws.id);
                    }}
                  >
                    <span>{ws.name}</span>
                  </button>
                  <button
                    className="workspace-settings-btn"
                    title={t('workspace.settings')}
                    onClick={() => {
                      setShowAllWorkspaces(false);
                      setSelectedWorkspaceId(ws.id);
                      setMode('settings');
                    }}
                  >
                    ⚙️
                  </button>
                </div>
              ))}
              {workspaces.length === 0 && !workspaceLoading && (
                <div className="empty">{t('workspace.none')}</div>
              )}
            </div>
            <div className="inline-form">
              <input
                type="text"
                placeholder={t('workspace.createPlaceholder')}
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateWorkspace()}
              />
              <button onClick={handleCreateWorkspace} disabled={creatingWorkspace || !newWorkspaceName.trim()}>
                {creatingWorkspace ? t('workspace.creating') : t('workspace.create')}
              </button>
            </div>
          </aside>
        )}

        {mode === 'edit' && visibleColumns.workspace && visibleColumns.documents && (
          <div
            className="column-resizer"
            role="separator"
            aria-label="调整工作空间宽度"
            onMouseDown={startResize('workspace')}
          />
        )}

        {mode === 'edit' && visibleColumns.documents && (
          <aside className="notes-column document-column">
            <div className="column-header">
              <div>
                <h3>{t('nav.documents')}</h3>
                <p className="muted">Documents</p>
              </div>
              <button className="secondary" onClick={reload} disabled={docsLoading}>
                {t('common.refresh')}
              </button>
            </div>
            <div className="inline-form">
              <input
                type="text"
                placeholder={t('doc.newTitlePlaceholder')}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateDocument()}
              />
              <button onClick={handleCreateDocument} disabled={creatingDocument || !newTitle.trim() || !selectedWorkspaceId}>
                {creatingDocument ? t('doc.creating') : t('doc.create')}
              </button>
            </div>
            {createDocError && <p className="error">{createDocError}</p>}
            <div className="document-list">
              {(filteredDocuments ?? []).map((doc) => (
                <div
                  key={doc.id}
                  className={`document-item ${id === doc.id ? 'active' : ''}`}
                >
                  <button className="doc-main" onClick={() => navigate(`/documents/${doc.id}`)}>
                    <span className="doc-title">{doc.title}</span>
                    <span className="doc-meta">
                      {workspaceMap.get(doc.workspace_id)?.name ?? t('nav.workspace')} · {new Date(doc.updated_at).toLocaleDateString(i18n.language)}
                    </span>
                  </button>
                  {doc.owner_id === user?.id && (
                    <button className="doc-delete" onClick={() => handleDeleteDocument(doc)}>
                      {t('workspace.delete')}
                    </button>
                  )}
                </div>
              ))}
              {filteredDocuments?.length === 0 && <div className="empty">{t('doc.empty')}</div>}
            </div>
          </aside>
        )}

        {mode === 'edit' && (visibleColumns.documents || visibleColumns.workspace) && (
          <div
            className="column-resizer"
            role="separator"
            aria-label="调整左侧列表宽度"
            onMouseDown={startResize(visibleColumns.documents ? 'documents' : 'workspace')}
          />
        )}
        {mode === 'edit' && (
          <main className="notes-column editor-column">
            {docLoading && <div className="loading-inline">{t('common.loading')}</div>}
            {!docLoading && documentError && <div className="error">{documentError}</div>}
            {!docLoading && !document && (
              <div className="empty-state">
                {t('doc.pickPrompt')}
              </div>
            )}
            {!docLoading && document && (
              <textarea
                ref={textareaRef}
                className="editor-textarea"
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                spellCheck={false}
              />
            )}
          </main>
        )}

        {mode === 'edit' && visibleColumns.preview && (
          <div
            className="column-resizer"
            role="separator"
            aria-label="调整预览宽度"
            onMouseDown={startResize('preview')}
          />
        )}

        {mode === 'edit' && visibleColumns.preview && (
          <aside className="notes-column preview-column">
            {activePanel === 'preview' && (
              document
                ? <MarkdownPreview content={content} />
                : <div className="empty-state">{t('doc.previewEmpty')}</div>
            )}
            {activePanel === 'history' && (
              document
                ? <SnapshotPanel documentId={document.id} onRestore={(doc) => {
                  setDocument(doc);
                  setContent(doc.content);
                }} />
                : <div className="empty-state">{t('doc.historyEmpty')}</div>
            )}
            {activePanel === 'permissions' && (
              document
                ? <PermissionsPanel documentId={document.id} />
                : <div className="empty-state">{t('doc.permissionsEmpty')}</div>
            )}
            {activePanel === 'attachments' && (
              document
                ? <AttachmentPanel
                    documentId={document.id}
                    workspaceId={document.workspace_id}
                    onInsert={handleInsertAttachment}
                  />
                : <div className="empty-state">{t('doc.attachmentsEmpty')}</div>
            )}
          </aside>
        )}

        {mode === 'settings' && (
          <section className="notes-column settings-column">
            <div className="column-header">
              <div>
                <h3>{t('workspace.settings')}</h3>
                <p className="muted">{t('nav.settings')}</p>
              </div>
              <button className="secondary" onClick={() => setMode('edit')}>
                {t('nav.backToEdit')}
              </button>
            </div>
            <div className="settings-body">
              <WorkspaceSettingsPanel
                workspaceId={selectedWorkspaceId}
                workspaceOwnerId={selectedWorkspace?.owner_id}
                workspaceName={selectedWorkspace?.name}
                workspaceIsPublic={selectedWorkspace?.is_public}
                onWorkspaceUpdated={handleWorkspaceUpdated}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

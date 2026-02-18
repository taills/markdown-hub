import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  const resizeRef = useRef<{
    type: ResizableColumn;
    startX: number;
    startWidths: Record<ResizableColumn, number>;
  } | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [defaultWorkspaceId, setDefaultWorkspaceId] = useState('');
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

  useEffect(() => {
    setDefaultWorkspaceId(user?.default_workspace_id ?? '');
  }, [user?.default_workspace_id]);

  useEffect(() => {
    let isMounted = true;
    setWorkspaceLoading(true);
    workspaceService
      .list()
      .then((data) => {
        if (!isMounted) return;
        setWorkspaces(data ?? []);
        const initialId = user?.default_workspace_id || data?.[0]?.id || '';
        setSelectedWorkspaceId((prev) => prev || initialId);
      })
      .catch((e: Error) => setWorkspaceError(e.message))
      .finally(() => setWorkspaceLoading(false));
    return () => {
      isMounted = false;
    };
  }, [user?.default_workspace_id]);

  useEffect(() => {
    if (document) setContent(document.content);
    if (!document) setContent('');
  }, [document]);

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
      if (msg.content !== undefined) setContent(msg.content);
    }
    if (msg.type === 'update' && msg.user_id && msg.user_id !== user?.id) {
      setCollaborators((prev) =>
        prev.includes(msg.user_id!) ? prev : [...prev, msg.user_id!]
      );
    }
  }, [user?.id]);

  const { send, connectionState: wsState } = useWebSocket({
    documentId: id ?? '',
    token: token ?? '',
    onMessage: handleWSMessage,
  });

  useEffect(() => {
    setConnectionState(wsState);
  }, [wsState]);

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      if (!id) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        send({ type: 'update', content: newContent });
      }, 500);
    },
    [id, send]
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
    setContent(newContent);
    if (id) send({ type: 'update', content: newContent });

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
        send({ type: 'update', content });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [content, id, send]);

  const workspaceMap = useMemo(() => {
    const map = new Map<string, Workspace>();
    workspaces.forEach((ws) => map.set(ws.id, ws));
    return map;
  }, [workspaces]);

  const selectedWorkspace = useMemo(() => {
    return workspaces.find((ws) => ws.id === selectedWorkspaceId);
  }, [workspaces, selectedWorkspaceId]);

  const handleWorkspaceUpdated = useCallback((updated: { id: string; name: string }) => {
    setWorkspaces((prev) =>
      prev.map((ws) => (ws.id === updated.id ? { ...ws, name: updated.name } : ws))
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

  const handleCreateDocument = async () => {
    if (!newTitle.trim()) return;
    setCreatingDocument(true);
    setCreateDocError('');
    try {
      const workspaceId = showAllWorkspaces
        ? (defaultWorkspaceId || selectedWorkspaceId)
        : selectedWorkspaceId;
      const doc = await documentService.create(newTitle.trim(), '', workspaceId || undefined);
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
    if (!confirm('Delete this document?')) return;
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

  const handleSetDefaultWorkspace = async () => {
    if (!selectedWorkspaceId) return;
    setWorkspaceError('');
    try {
      await workspaceService.setDefault(selectedWorkspaceId);
      setDefaultWorkspaceId(selectedWorkspaceId);
    } catch (e: unknown) {
      setWorkspaceError(e instanceof Error ? e.message : 'Error');
    }
  };

  const saveTitle = async () => {
    if (!document || titleSaving) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleError('标题不能为空');
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
      setTitleError(e instanceof Error ? e.message : '更新标题失败');
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
            {!document && <span className="doc-title">未选择文档</span>}
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
                  aria-label="文档标题"
                />
                <div className="doc-title-actions">
                  <button
                    className="doc-title-btn"
                    onClick={saveTitle}
                    disabled={titleSaving}
                  >
                    保存
                  </button>
                  <button
                    className="doc-title-btn ghost"
                    onClick={cancelTitleEdit}
                    disabled={titleSaving}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
            {document && canEditTitle && !isEditingTitle && (
              <button
                className="doc-title-btn ghost"
                onClick={() => setIsEditingTitle(true)}
                title="编辑标题"
              >
                编辑
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
              工作空间
            </button>
            <button
              className={visibleColumns.documents ? 'active' : ''}
              onClick={() => toggleColumn('documents')}
              disabled={mode === 'settings'}
            >
              文档列表
            </button>
            <button
              className={visibleColumns.preview ? 'active' : ''}
              onClick={() => toggleColumn('preview')}
              disabled={mode === 'settings'}
            >
              预览/面板
            </button>
          </div>
          <div className="menu-group">
            <button
              className={activePanel === 'preview' ? 'active' : ''}
              onClick={() => setActivePanel('preview')}
              disabled={mode === 'settings'}
            >
              预览
            </button>
            <button
              className={activePanel === 'history' ? 'active' : ''}
              onClick={() => setActivePanel('history')}
              disabled={mode === 'settings'}
            >
              历史
            </button>
            <button
              className={activePanel === 'permissions' ? 'active' : ''}
              onClick={() => setActivePanel('permissions')}
              disabled={mode === 'settings'}
            >
              权限
            </button>
            <button
              className={activePanel === 'attachments' ? 'active' : ''}
              onClick={() => setActivePanel('attachments')}
              disabled={mode === 'settings'}
            >
              附件
            </button>
          </div>
        </div>

        <div className="topbar-right">
          {id && (
            <span className={`ws-pill ws-${connectionState}`}>
              {connectionState}
            </span>
          )}
          {collaborators.length > 0 && (
            <span className="collaborators">{collaborators.length} online</span>
          )}
          <span className="user-chip">{user?.username}</span>
          <button className="ghost" onClick={logout}>退出</button>
        </div>
      </header>

      <div className="notes-columns" style={columnsStyle} ref={containerRef}>
        {visibleColumns.workspace && (
          <aside className="notes-column workspace-column">
            <div className="column-header">
              <div>
                <h3>工作空间</h3>
                <p className="muted">Folders</p>
              </div>
              <button
                className="secondary"
                onClick={handleSetDefaultWorkspace}
                disabled={!selectedWorkspaceId || selectedWorkspaceId === defaultWorkspaceId}
              >
                {selectedWorkspaceId === defaultWorkspaceId ? '默认' : '设为默认'}
              </button>
            </div>
            {workspaceError && <p className="error">{workspaceError}</p>}
            <div className="workspace-list">
              <button
                className={`workspace-item ${showAllWorkspaces ? 'active' : ''}`}
                onClick={() => setShowAllWorkspaces(true)}
              >
                全部工作空间
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
                    {ws.id === defaultWorkspaceId && <span className="workspace-badge">默认</span>}
                  </button>
                  <button
                    className="workspace-settings-btn"
                    title="工作空间设置"
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
                <div className="empty">暂无工作空间。</div>
              )}
            </div>
            <div className="inline-form">
              <input
                type="text"
                placeholder="新建工作空间"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateWorkspace()}
              />
              <button onClick={handleCreateWorkspace} disabled={creatingWorkspace || !newWorkspaceName.trim()}>
                {creatingWorkspace ? '创建中…' : '创建'}
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
                <h3>文档</h3>
                <p className="muted">Documents</p>
              </div>
              <button className="secondary" onClick={reload} disabled={docsLoading}>
                刷新
              </button>
            </div>
            <div className="inline-form">
              <input
                type="text"
                placeholder="新文档标题"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateDocument()}
              />
              <button onClick={handleCreateDocument} disabled={creatingDocument || !newTitle.trim()}>
                {creatingDocument ? '创建中…' : '新建'}
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
                      {workspaceMap.get(doc.workspace_id)?.name ?? 'Workspace'} · {new Date(doc.updated_at).toLocaleDateString()}
                    </span>
                  </button>
                  {doc.owner_id === user?.id && (
                    <button className="doc-delete" onClick={() => handleDeleteDocument(doc)}>
                      删除
                    </button>
                  )}
                </div>
              ))}
              {filteredDocuments?.length === 0 && <div className="empty">暂无文档。</div>}
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
            {docLoading && <div className="loading-inline">加载中…</div>}
            {!docLoading && documentError && <div className="error">{documentError}</div>}
            {!docLoading && !document && (
              <div className="empty-state">
                请选择左侧文档，开始写作。
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
                : <div className="empty-state">暂无可预览内容。</div>
            )}
            {activePanel === 'history' && (
              document
                ? <SnapshotPanel documentId={document.id} onRestore={(doc) => {
                  setDocument(doc);
                  setContent(doc.content);
                }} />
                : <div className="empty-state">请选择文档查看历史。</div>
            )}
            {activePanel === 'permissions' && (
              document
                ? <PermissionsPanel documentId={document.id} />
                : <div className="empty-state">请选择文档查看权限。</div>
            )}
            {activePanel === 'attachments' && (
              document
                ? <AttachmentPanel
                    documentId={document.id}
                    workspaceId={document.workspace_id}
                    onInsert={handleInsertAttachment}
                  />
                : <div className="empty-state">请选择文档查看附件。</div>
            )}
          </aside>
        )}

        {mode === 'settings' && (
          <section className="notes-column settings-column">
            <div className="column-header">
              <div>
                <h3>工作空间设置</h3>
                <p className="muted">Settings</p>
              </div>
              <button className="secondary" onClick={() => setMode('edit')}>
                返回编辑
              </button>
            </div>
            <div className="settings-body">
              <WorkspaceSettingsPanel
                workspaceId={selectedWorkspaceId}
                workspaceOwnerId={selectedWorkspace?.owner_id}
                workspaceName={selectedWorkspace?.name}
                onWorkspaceUpdated={handleWorkspaceUpdated}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

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

type Panel = 'preview' | 'history' | 'permissions' | 'attachments' | 'workspace';

type Column = 'workspace' | 'documents' | 'preview';

export function NotesLayout() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user, logout, token } = useAuth();
  const { documents, isLoading: docsLoading, reload } = useDocumentList();
  const { document, setDocument, isLoading: docLoading, error: documentError } = useDocument(id ?? '');

  const [content, setContent] = useState('');
  const [activePanel, setActivePanel] = useState<Panel>('preview');
  const [visibleColumns, setVisibleColumns] = useState<Record<Column, boolean>>({
    workspace: true,
    documents: true,
    preview: true,
  });
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState('disconnected');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const filteredDocuments = useMemo(() => {
    if (showAllWorkspaces || !selectedWorkspaceId) return documents;
    return (documents ?? []).filter((doc) => doc.workspace_id === selectedWorkspaceId);
  }, [documents, selectedWorkspaceId, showAllWorkspaces]);

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

  const toggleColumn = (column: Column) => {
    setVisibleColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  };

  const columnsStyle = useMemo(() => {
    const workspaceWidth = visibleColumns.workspace ? '240px' : '0px';
    const documentWidth = visibleColumns.documents ? '300px' : '0px';
    const previewWidth = visibleColumns.preview ? '360px' : '0px';
    return {
      gridTemplateColumns: `${workspaceWidth} ${documentWidth} minmax(420px, 1fr) ${previewWidth}`,
    } as React.CSSProperties;
  }, [visibleColumns]);

  return (
    <div className="notes-shell">
      <header className="notes-topbar">
        <div className="topbar-left">
          <span className="app-title">MarkdownHub</span>
          <span className="doc-title">{document?.title || '未选择文档'}</span>
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
            >
              文档列表
            </button>
            <button
              className={visibleColumns.preview ? 'active' : ''}
              onClick={() => toggleColumn('preview')}
            >
              预览/面板
            </button>
          </div>
          <div className="menu-group">
            <button
              className={activePanel === 'preview' ? 'active' : ''}
              onClick={() => setActivePanel('preview')}
            >
              预览
            </button>
            <button
              className={activePanel === 'history' ? 'active' : ''}
              onClick={() => setActivePanel('history')}
            >
              历史
            </button>
            <button
              className={activePanel === 'permissions' ? 'active' : ''}
              onClick={() => setActivePanel('permissions')}
            >
              权限
            </button>
            <button
              className={activePanel === 'attachments' ? 'active' : ''}
              onClick={() => setActivePanel('attachments')}
            >
              附件
            </button>
            <button
              className={activePanel === 'workspace' ? 'active' : ''}
              onClick={() => setActivePanel('workspace')}
            >
              工作空间设置
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

      <div className="notes-columns" style={columnsStyle}>
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
                <button
                  key={ws.id}
                  className={`workspace-item ${!showAllWorkspaces && selectedWorkspaceId === ws.id ? 'active' : ''}`}
                  onClick={() => {
                    setShowAllWorkspaces(false);
                    setSelectedWorkspaceId(ws.id);
                  }}
                >
                  <span>{ws.name}</span>
                  {ws.id === defaultWorkspaceId && <span className="workspace-badge">默认</span>}
                </button>
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

        {visibleColumns.documents && (
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

        {visibleColumns.preview && (
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
            {activePanel === 'workspace' && (
              <WorkspaceSettingsPanel workspaceId={selectedWorkspaceId} />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

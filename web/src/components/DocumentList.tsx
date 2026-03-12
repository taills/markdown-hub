import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentList } from '@/hooks/useDocument';
import { useAuth } from '@/hooks/useAuth';
import { useSiteTitle } from '@/hooks/useSiteTitle';
import { documentService, workspaceService, workspaceAttachmentService } from '@/services/api';
import { ErrorModal } from '@/components/ErrorModal';
import type { DocumentListItem, PermissionLevel, Workspace, WorkspaceMember, Attachment } from '@/types';

export function DocumentList() {
  const { t } = useTranslation();
  const { documents, isLoading, reload } = useDocumentList();
  const { user, logout } = useAuth();
  const { siteTitle } = useSiteTitle();
  const navigate = useNavigate();
  const [newTitle, setNewTitle] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceAttachments, setWorkspaceAttachments] = useState<Attachment[]>([]);
  const [memberUsername, setMemberUsername] = useState('');
  const [memberLevel, setMemberLevel] = useState<PermissionLevel>('read');
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [memberSaving, setMemberSaving] = useState(false);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [showAllWorkspaces, setShowAllWorkspaces] = useState(false);

  const modalError = error || workspaceError;
  const handleCloseError = () => {
    setError('');
    setWorkspaceError('');
  };

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

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    setWorkspaceError('');
    workspaceService
      .listMembers(selectedWorkspaceId)
      .then((data) => setWorkspaceMembers(data ?? []))
      .catch((e: Error) => setWorkspaceError(e.message));
    workspaceAttachmentService
      .list(selectedWorkspaceId)
      .then((data) => setWorkspaceAttachments(data ?? []))
      .catch((e: Error) => setWorkspaceError(e.message));
  }, [selectedWorkspaceId]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    if (!selectedWorkspaceId) {
      setError(t('workspace.createOrJoinFirst'));
      return;
    }
    setCreating(true);
    setError('');
    try {
      const doc = await documentService.create(newTitle.trim(), '', selectedWorkspaceId);
      navigate(`/documents/${doc.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setCreating(false);
    }
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

  const handleAddMember = async () => {
    if (!memberUsername.trim() || !selectedWorkspaceId) return;
    setMemberSaving(true);
    setWorkspaceError('');
    try {
      const member = await workspaceService.setMember(
        selectedWorkspaceId,
        memberUsername.trim(),
        memberLevel
      );
      setWorkspaceMembers((prev) => {
        const filtered = prev.filter((m) => m.user_id !== member.user_id);
        return [member, ...filtered];
      });
      setMemberUsername('');
      setMemberLevel('read');
    } catch (e: unknown) {
      setWorkspaceError(e instanceof Error ? e.message : 'Error');
    } finally {
      setMemberSaving(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedWorkspaceId) return;
    await workspaceService.removeMember(selectedWorkspaceId, userId).catch(() => null);
    setWorkspaceMembers((prev) => prev.filter((m) => m.user_id !== userId));
  };

  const handleWorkspaceUpload = async (file: File) => {
    if (!selectedWorkspaceId) return;
    setAttachmentsUploading(true);
    setWorkspaceError('');
    try {
      const attachment = await workspaceAttachmentService.upload(selectedWorkspaceId, file);
      setWorkspaceAttachments((prev) => [attachment, ...prev]);
    } catch (e: unknown) {
      setWorkspaceError(e instanceof Error ? e.message : 'Error');
    } finally {
      setAttachmentsUploading(false);
    }
  };

  const handleWorkspaceDelete = async (attachmentId: string) => {
    if (!selectedWorkspaceId) return;
    await workspaceAttachmentService.delete(selectedWorkspaceId, attachmentId).catch(() => null);
    setWorkspaceAttachments((prev) => prev.filter((att) => att.id !== attachmentId));
  };

  const handleWorkspaceDownload = async (attachment: Attachment) => {
    const blob = await workspaceAttachmentService.download(attachment.id);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.filename || 'attachment';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    await documentService.delete(id).catch(() => null);
    reload();
  };

  const getPermissionBadge = (doc: DocumentListItem) => {
    if (doc.owner_id === user?.id) {
      return <span className="badge badge-owner">Owner</span>;
    }
    if (doc.permission) {
      return <span className={`badge badge-${doc.permission}`}>{doc.permission}</span>;
    }
    return null;
  };

  const workspaceMap = useMemo(() => {
    const map = new Map<string, Workspace>();
    workspaces.forEach((ws) => map.set(ws.id, ws));
    return map;
  }, [workspaces]);

  const filteredDocuments = useMemo(() => {
    if (showAllWorkspaces || !selectedWorkspaceId) return documents;
    return (documents ?? []).filter((doc) => doc.workspace_id === selectedWorkspaceId);
  }, [documents, selectedWorkspaceId, showAllWorkspaces]);

  return (
    <div className="document-list-page">
      <header>
        <h1>{siteTitle}</h1>
        <div className="user-info">
          <span>{user?.username}</span>
          <button onClick={logout}>Sign out</button>
        </div>
      </header>

      <div className="new-document">
        <select
          className="workspace-select"
          value={showAllWorkspaces ? 'all' : selectedWorkspaceId}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'all') {
              setShowAllWorkspaces(true);
            } else {
              setShowAllWorkspaces(false);
              setSelectedWorkspaceId(value);
            }
          }}
          disabled={workspaceLoading}
        >
          <option value="all">All workspaces</option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="New document title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button onClick={handleCreate} disabled={creating || !newTitle.trim() || !selectedWorkspaceId}>
          {creating ? 'Creating…' : 'New Document'}
        </button>
      </div>

      <section className="workspace-panel">
        <div className="workspace-header">
          <div>
            <h2>Workspace</h2>
            <p className="muted">管理工作空间权限与附件</p>
          </div>
        </div>

        <div className="workspace-actions">
          <input
            type="text"
            placeholder="New workspace name"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateWorkspace()}
          />
          <button onClick={handleCreateWorkspace} disabled={creatingWorkspace || !newWorkspaceName.trim()}>
            {creatingWorkspace ? 'Creating…' : 'Create Workspace'}
          </button>
        </div>

        <div className="workspace-grid">
          <div className="workspace-card">
            <h3>Members</h3>
            <div className="add-member-form">
              <input
                type="text"
                placeholder="Username"
                value={memberUsername}
                onChange={(e) => setMemberUsername(e.target.value)}
              />
              <select value={memberLevel} onChange={(e) => setMemberLevel(e.target.value as PermissionLevel)}>
                <option value="read">read</option>
                <option value="edit">edit</option>
                <option value="manage">manage</option>
              </select>
              <button onClick={handleAddMember} disabled={memberSaving || !memberUsername.trim()}>
                {memberSaving ? 'Saving…' : 'Add'}
              </button>
            </div>
            <ul className="member-list">
              {workspaceMembers.map((member) => (
                <li key={member.id} className="member-item">
                  <span className="member-name">{member.username || member.user_id}</span>
                  <span className={`perm-level perm-${member.level}`}>{member.level}</span>
                  <button onClick={() => handleRemoveMember(member.user_id)}>Remove</button>
                </li>
              ))}
              {workspaceMembers.length === 0 && <li className="empty">No members yet.</li>}
            </ul>
          </div>

          <div className="workspace-card">
            <h3>Workspace Attachments</h3>
            <label className="upload-button">
              {attachmentsUploading ? 'Uploading…' : 'Upload'}
              <input
                type="file"
                hidden
                disabled={attachmentsUploading || !selectedWorkspaceId}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleWorkspaceUpload(file);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            <table className="attachment-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th className="att-actions-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workspaceAttachments.map((att) => (
                  <tr key={att.id}>
                    <td className="att-name-cell">{att.filename}</td>
                    <td className="att-size-cell">{(att.file_size / 1024).toFixed(1)} KB</td>
                    <td className="att-actions-cell">
                      <div className="att-actions">
                        <button className="att-download" onClick={() => handleWorkspaceDownload(att)}>Download</button>
                        <button className="att-delete" onClick={() => handleWorkspaceDelete(att.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {workspaceAttachments.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty">No workspace attachments.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <ul className="document-items">
          {(filteredDocuments ?? []).map((doc) => (
            <li key={doc.id} className="document-item">
              <button className="doc-link" onClick={() => navigate(`/documents/${doc.id}`)}>
                <span className="doc-title">{doc.title}</span>
                {showAllWorkspaces && (
                  <span className="doc-workspace">
                    {workspaceMap.get(doc.workspace_id)?.name ?? 'Workspace'}
                  </span>
                )}
                {getPermissionBadge(doc)}
                <span className="doc-date">{new Date(doc.updated_at).toLocaleDateString()}</span>
              </button>
              {doc.owner_id === user?.id && (
                <button className="doc-delete" onClick={() => handleDelete(doc.id)}>
                  Delete
                </button>
              )}
            </li>
          ))}
          {filteredDocuments?.length === 0 && <li className="empty">No documents yet.</li>}
        </ul>
      )}

      <ErrorModal message={modalError} onClose={handleCloseError} />
    </div>
  );
}

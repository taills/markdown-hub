import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { workspaceService, workspaceAttachmentService } from '@/services/api';
import type { Attachment, PermissionLevel, WorkspaceMember } from '@/types';

interface WorkspaceSettingsPanelProps {
  workspaceId: string;
  workspaceOwnerId?: string;
  workspaceName?: string;
  workspaceIsPublic?: boolean;
  onWorkspaceUpdated?: (workspace: { id: string; name: string; is_public: boolean }) => void;
}

export function WorkspaceSettingsPanel({
  workspaceId,
  workspaceOwnerId,
  workspaceName,
  workspaceIsPublic,
  onWorkspaceUpdated,
}: WorkspaceSettingsPanelProps) {
  const { t } = useTranslation();
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceAttachments, setWorkspaceAttachments] = useState<Attachment[]>([]);
  const [memberUsername, setMemberUsername] = useState('');
  const [memberLevel, setMemberLevel] = useState<PermissionLevel>('read');
  const [memberSaving, setMemberSaving] = useState(false);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [nameEditing, setNameEditing] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [isPublic, setIsPublic] = useState(workspaceIsPublic ?? false);
  const [publicToggling, setPublicToggling] = useState(false);
  const [publicError, setPublicError] = useState('');
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    setWorkspaceError('');
    workspaceService
      .listMembers(workspaceId)
      .then((data) => setWorkspaceMembers(data ?? []))
      .catch((e: Error) => setWorkspaceError(e.message));
    workspaceAttachmentService
      .list(workspaceId)
      .then((data) => setWorkspaceAttachments(data ?? []))
      .catch((e: Error) => setWorkspaceError(e.message));
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    setNameDraft(workspaceName ?? '');
    setNameEditing(false);
    setNameError('');
    setIsPublic(workspaceIsPublic ?? false);
    setPublicError('');
  }, [workspaceId, workspaceName, workspaceIsPublic]);

  const handleSaveWorkspaceName = async () => {
    if (!workspaceId || nameSaving) return;
    const nextName = nameDraft.trim();
    if (!nextName) {
      setNameError(t('workspace.nameEmpty'));
      return;
    }
    if (nextName === workspaceName) {
      setNameEditing(false);
      setNameError('');
      return;
    }
    setNameSaving(true);
    setNameError('');
    try {
      const ws = await workspaceService.updateName(workspaceId, nextName);
      setNameDraft(ws.name);
      setNameEditing(false);
      onWorkspaceUpdated?.({ id: ws.id, name: ws.name, is_public: isPublic });
    } catch (e: unknown) {
      setNameError(e instanceof Error ? e.message : t('workspace.nameUpdateFailed'));
    } finally {
      setNameSaving(false);
    }
  };

  const handleTogglePublic = async () => {
    if (!workspaceId || publicToggling) return;
    setPublicToggling(true);
    setPublicError('');
    try {
      const ws = await workspaceService.setPublic(workspaceId, !isPublic);
      setIsPublic(ws.is_public);
      onWorkspaceUpdated?.({ id: ws.id, name: ws.name, is_public: ws.is_public });
    } catch (e: unknown) {
      setPublicError(e instanceof Error ? e.message : t('workspace.togglePublicFailed'));
    } finally {
      setPublicToggling(false);
    }
  };

  const handleCopyPublicLink = async () => {
    const url = `${window.location.origin}/workspaces/${workspaceId}/view`;
    await navigator.clipboard.writeText(url).catch(() => null);
    setPublicLinkCopied(true);
    setTimeout(() => setPublicLinkCopied(false), 2000);
  };

  const handleCancelWorkspaceName = () => {
    setNameDraft(workspaceName ?? '');
    setNameEditing(false);
    setNameError('');
  };

  const handleAddMember = async () => {
    if (!memberUsername.trim() || !workspaceId) return;
    setMemberSaving(true);
    setWorkspaceError('');
    try {
      const member = await workspaceService.setMember(
        workspaceId,
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
      setWorkspaceError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setMemberSaving(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!workspaceId) return;
    await workspaceService.removeMember(workspaceId, userId).catch(() => null);
    setWorkspaceMembers((prev) => prev.filter((m) => m.user_id !== userId));
  };

  const handleWorkspaceUpload = async (file: File) => {
    if (!workspaceId) return;
    setAttachmentsUploading(true);
    setWorkspaceError('');
    try {
      const attachment = await workspaceAttachmentService.upload(workspaceId, file);
      setWorkspaceAttachments((prev) => [attachment, ...prev]);
    } catch (e: unknown) {
      setWorkspaceError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setAttachmentsUploading(false);
    }
  };

  const handleWorkspaceDelete = async (attachmentId: string) => {
    if (!workspaceId) return;
    await workspaceAttachmentService.delete(workspaceId, attachmentId).catch(() => null);
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

  if (!workspaceId) {
    return <div className="empty-state">{t('workspace.selectToView')}</div>;
  }

  return (
    <div className="workspace-settings">
      <div className="workspace-settings-section">
        <div className="section-header">
          <h3>{t('workspace.name')}</h3>
        </div>
        <div className="inline-form">
          <input
            type="text"
            placeholder={t('workspace.name')}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onFocus={() => setNameEditing(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveWorkspaceName();
              if (e.key === 'Escape') handleCancelWorkspaceName();
            }}
            onBlur={() => nameEditing && handleSaveWorkspaceName()}
            disabled={nameSaving}
          />
          <button onClick={handleSaveWorkspaceName} disabled={nameSaving || !nameDraft.trim()}>
            {nameSaving ? t('workspace.memberSaving') : t('doc.save')}
          </button>
          <button className="secondary" onClick={handleCancelWorkspaceName} disabled={nameSaving}>
            {t('doc.cancel')}
          </button>
        </div>
        {nameError && <p className="error">{nameError}</p>}
      </div>

      <div className="workspace-settings-section">
        <div className="section-header">
          <h3>{t('workspace.isPublic')}</h3>
        </div>
        <div className="inline-form">
          <button onClick={handleTogglePublic} disabled={publicToggling}>
            {isPublic ? t('workspace.setPublic') : t('workspace.setPrivate')}
          </button>
          {isPublic && (
            <button className="secondary" onClick={handleCopyPublicLink}>
              {publicLinkCopied ? t('workspace.publicLinkCopied') : t('workspace.publicLink')}
            </button>
          )}
        </div>
        {publicError && <p className="error">{publicError}</p>}
      </div>

      <div className="workspace-settings-section">
        <h3>{t('workspace.members')}</h3>
        <div className="inline-form">
          <input
            type="text"
            placeholder={t('workspace.memberUsername')}
            value={memberUsername}
            onChange={(e) => setMemberUsername(e.target.value)}
          />
          <select value={memberLevel} onChange={(e) => setMemberLevel(e.target.value as PermissionLevel)}>
            <option value="read">{t('permissions.read')}</option>
            <option value="edit">{t('permissions.edit')}</option>
            <option value="manage">{t('permissions.manage')}</option>
          </select>
          <button onClick={handleAddMember} disabled={memberSaving || !memberUsername.trim()}>
            {memberSaving ? t('workspace.memberSaving') : t('workspace.memberAdd')}
          </button>
        </div>
        {workspaceError && <p className="error">{workspaceError}</p>}
        <ul className="member-list">
          {workspaceMembers.map((member) => {
            const isOwner = member.user_id === workspaceOwnerId;
            return (
              <li key={member.id} className="member-item">
                <span className="member-name">{member.username || member.user_id}</span>
                {isOwner ? (
                  <span className="perm-level perm-owner">{t('workspace.memberOwner')}</span>
                ) : (
                  <span className={`perm-level perm-${member.level}`}>{member.level}</span>
                )}
                <button
                  onClick={() => handleRemoveMember(member.user_id)}
                  disabled={isOwner}
                  title={isOwner ? t('workspace.memberRemoveBlocked') : t('workspace.memberRemove')}
                >
                  {t('workspace.memberRemove')}
                </button>
              </li>
            );
          })}
          {workspaceMembers.length === 0 && <li className="empty">{t('workspace.noMembers')}</li>}
        </ul>
      </div>

      <div className="workspace-settings-section">
        <div className="section-header">
          <h3>{t('workspace.attachments')}</h3>
          <label className="upload-button compact">
            {attachmentsUploading ? t('workspace.uploading') : t('workspace.upload')}
            <input
              type="file"
              hidden
              disabled={attachmentsUploading || !workspaceId}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleWorkspaceUpload(file);
                e.currentTarget.value = '';
              }}
            />
          </label>
        </div>
        <table className="attachment-table">
          <thead>
            <tr>
              <th>{t('workspace.nameLabel')}</th>
              <th>{t('workspace.size')}</th>
              <th className="att-actions-header">{t('workspace.operations')}</th>
            </tr>
          </thead>
          <tbody>
            {workspaceAttachments.map((att) => (
              <tr key={att.id}>
                <td className="att-name-cell">{att.filename}</td>
                <td className="att-size-cell">{(att.file_size / 1024).toFixed(1)} KB</td>
                <td className="att-actions-cell">
                  <div className="att-actions">
                    <button className="att-download" onClick={() => handleWorkspaceDownload(att)}>{t('workspace.download')}</button>
                    <button className="att-delete" onClick={() => handleWorkspaceDelete(att.id)}>{t('workspace.delete')}</button>
                  </div>
                </td>
              </tr>
            ))}
            {workspaceAttachments.length === 0 && (
              <tr>
                <td colSpan={3} className="empty">{t('workspace.noAttachments')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

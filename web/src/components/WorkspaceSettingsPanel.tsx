import { useEffect, useState } from 'react';
import { workspaceService, workspaceAttachmentService } from '@/services/api';
import type { Attachment, PermissionLevel, WorkspaceMember } from '@/types';

interface WorkspaceSettingsPanelProps {
  workspaceId: string;
}

export function WorkspaceSettingsPanel({ workspaceId }: WorkspaceSettingsPanelProps) {
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceAttachments, setWorkspaceAttachments] = useState<Attachment[]>([]);
  const [memberUsername, setMemberUsername] = useState('');
  const [memberLevel, setMemberLevel] = useState<PermissionLevel>('read');
  const [memberSaving, setMemberSaving] = useState(false);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');

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
      setWorkspaceError(e instanceof Error ? e.message : 'Error');
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
      setWorkspaceError(e instanceof Error ? e.message : 'Error');
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
    return <div className="empty-state">请选择一个工作空间以查看设置。</div>;
  }

  return (
    <div className="workspace-settings">
      <div className="workspace-settings-section">
        <h3>成员权限</h3>
        <div className="inline-form">
          <input
            type="text"
            placeholder="用户名"
            value={memberUsername}
            onChange={(e) => setMemberUsername(e.target.value)}
          />
          <select value={memberLevel} onChange={(e) => setMemberLevel(e.target.value as PermissionLevel)}>
            <option value="read">read</option>
            <option value="edit">edit</option>
            <option value="manage">manage</option>
          </select>
          <button onClick={handleAddMember} disabled={memberSaving || !memberUsername.trim()}>
            {memberSaving ? '保存中…' : '添加'}
          </button>
        </div>
        {workspaceError && <p className="error">{workspaceError}</p>}
        <ul className="member-list">
          {workspaceMembers.map((member) => (
            <li key={member.id} className="member-item">
              <span className="member-name">{member.username || member.user_id}</span>
              <span className={`perm-level perm-${member.level}`}>{member.level}</span>
              <button onClick={() => handleRemoveMember(member.user_id)}>移除</button>
            </li>
          ))}
          {workspaceMembers.length === 0 && <li className="empty">暂无成员。</li>}
        </ul>
      </div>

      <div className="workspace-settings-section">
        <h3>工作空间附件</h3>
        <label className="upload-button">
          {attachmentsUploading ? '上传中…' : '上传附件'}
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
        <table className="attachment-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>大小</th>
              <th className="att-actions-header">操作</th>
            </tr>
          </thead>
          <tbody>
            {workspaceAttachments.map((att) => (
              <tr key={att.id}>
                <td className="att-name-cell">{att.filename}</td>
                <td className="att-size-cell">{(att.file_size / 1024).toFixed(1)} KB</td>
                <td className="att-actions-cell">
                  <div className="att-actions">
                    <button className="att-download" onClick={() => handleWorkspaceDownload(att)}>下载</button>
                    <button className="att-delete" onClick={() => handleWorkspaceDelete(att.id)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
            {workspaceAttachments.length === 0 && (
              <tr>
                <td colSpan={3} className="empty">暂无附件。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

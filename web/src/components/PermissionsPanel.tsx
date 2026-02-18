import { useState, useEffect, type FormEvent } from 'react';
import { permissionService } from '@/services/api';
import type { DocumentPermission, PermissionLevel } from '@/types';

interface PermissionsPanelProps {
  documentId: string;
}

export function PermissionsPanel({ documentId }: PermissionsPanelProps) {
  const [permissions, setPermissions] = useState<DocumentPermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [level, setLevel] = useState<PermissionLevel>('read');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setIsLoading(true);
    permissionService
      .list(documentId)
      .then((p) => setPermissions(p ?? []))
      .catch(() => null)
      .finally(() => setIsLoading(false));
  };

  useEffect(load, [documentId]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setSaving(true);
    setError('');
    try {
      await permissionService.set(documentId, username.trim(), level);
      setUsername('');
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (userId: string) => {
    await permissionService.remove(documentId, userId).catch(() => null);
    load();
  };

  return (
    <div className="permissions-panel">
      <h3>Collaborators</h3>
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <ul className="permission-list">
          {permissions.map((p) => (
            <li key={p.id} className="permission-item">
              <span className="perm-user">{p.username || p.user_id}</span>
              <span className={`perm-level perm-${p.level}`}>{p.level}</span>
              <button onClick={() => handleRemove(p.user_id)}>Remove</button>
            </li>
          ))}
          {permissions.length === 0 && <li className="empty">No collaborators.</li>}
        </ul>
      )}

      <form className="add-permission-form" onSubmit={handleAdd}>
        <h4>Add collaborator</h4>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <select value={level} onChange={(e) => setLevel(e.target.value as PermissionLevel)}>
          <option value="read">Read</option>
          <option value="edit">Edit</option>
          <option value="manage">Manage</option>
        </select>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving || !username.trim()}>
          {saving ? 'Adding…' : 'Add'}
        </button>
      </form>
    </div>
  );
}


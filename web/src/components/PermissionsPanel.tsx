import { useState, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { permissionService } from '@/services/api';
import { ErrorModal } from '@/components/ErrorModal';
import type { DocumentPermission, PermissionLevel } from '@/types';

interface PermissionsPanelProps {
  documentId: string;
}

export function PermissionsPanel({ documentId }: PermissionsPanelProps) {
  const { t } = useTranslation();
  const [permissions, setPermissions] = useState<DocumentPermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [level, setLevel] = useState<PermissionLevel>('read');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCloseError = () => setError('');

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
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (userId: string) => {
    await permissionService.remove(documentId, userId).catch(() => null);
    load();
  };

  const levelLabel = (lvl: PermissionLevel) => {
    switch (lvl) {
      case 'read':
        return t('permissions.read');
      case 'edit':
        return t('permissions.edit');
      case 'manage':
        return t('permissions.manage');
      default:
        return lvl;
    }
  };

  return (
    <div className="permissions-panel">
      <h3>{t('permissions.title')}</h3>
      {isLoading ? (
        <p>{t('permissions.loading')}</p>
      ) : (
        <ul className="permission-list">
          {permissions.map((p) => (
            <li key={p.id} className="permission-item">
              <span className="perm-user">{p.username || p.user_id}</span>
              <span className={`perm-level perm-${p.level}`}>{levelLabel(p.level)}</span>
              <button onClick={() => handleRemove(p.user_id)}>{t('permissions.remove')}</button>
            </li>
          ))}
          {permissions.length === 0 && <li className="empty">{t('permissions.empty')}</li>}
        </ul>
      )}

      <form className="add-permission-form" onSubmit={handleAdd}>
        <h4>{t('permissions.addTitle')}</h4>
        <input
          type="text"
          placeholder={t('permissions.username')}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <select value={level} onChange={(e) => setLevel(e.target.value as PermissionLevel)}>
          <option value="read">{t('permissions.read')}</option>
          <option value="edit">{t('permissions.edit')}</option>
          <option value="manage">{t('permissions.manage')}</option>
        </select>
        <button type="submit" disabled={saving || !username.trim()}>
          {saving ? t('permissions.adding') : t('permissions.add')}
        </button>
      </form>

      <ErrorModal message={error} onClose={handleCloseError} />
    </div>
  );
}


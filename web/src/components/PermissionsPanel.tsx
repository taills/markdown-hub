import { useState, useEffect, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { permissionService } from '@/services/api';
import { ErrorModal } from '@/components/ErrorModal';
import type { DocumentPermission, PermissionLevel } from '@/types';

interface PermissionsPanelProps {
  documentId: string;
}

const LEVEL_CONFIG: Record<PermissionLevel, { label: string; color: string }> = {
  read:   { label: '只读', color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  edit:   { label: '编辑', color: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  manage: { label: '管理', color: 'bg-[#fdf8ee] text-[#c9940a] dark:bg-yellow-900/30 dark:text-yellow-400' },
};

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
      case 'read':   return t('permissions.read');
      case 'edit':   return t('permissions.edit');
      case 'manage': return t('permissions.manage');
      default:       return lvl;
    }
  };

  const levelColor = (lvl: PermissionLevel) =>
    LEVEL_CONFIG[lvl]?.color ?? 'bg-gray-100 text-gray-500';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-neutral-800 shrink-0">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-neutral-500">
          {t('permissions.title')}
        </span>
        {!isLoading && (
          <span className="text-xs text-gray-400 dark:text-neutral-500">
            {permissions.length} 位协作者
          </span>
        )}
      </div>

      {/* 协作者列表 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-[#c9940a] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-400 dark:text-neutral-500">{t('permissions.loading')}</span>
            </div>
          </div>
        ) : permissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e5e5e5" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-sm" style={{ color: 'var(--meta-gray)' }}>{t('permissions.empty')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
            {permissions.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
                {/* 用户头像占位 */}
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-neutral-700 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-gray-400 dark:text-neutral-400 uppercase">
                    {(p.username || p.user_id).slice(0, 2)}
                  </span>
                </div>
                {/* 用户名 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-neutral-100 truncate">
                    {p.username || p.user_id}
                  </p>
                </div>
                {/* 权限徽章 */}
                <span className={`text-xs font-bold px-2 py-0.5 uppercase tracking-wide rounded ${levelColor(p.level)}`}>
                  {levelLabel(p.level)}
                </span>
                {/* 删除按钮 */}
                <button
                  onClick={() => handleRemove(p.user_id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
                  title={t('permissions.remove')}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 添加协作者表单 */}
      <div className="border-t border-gray-100 dark:border-neutral-800 px-4 py-4 shrink-0">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-neutral-500 mb-3">
          {t('permissions.addTitle')}
        </p>
        <form onSubmit={handleAdd} className="flex flex-col gap-2">
          <input
            type="text"
            className="auth-input text-sm"
            placeholder={t('permissions.username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <div className="flex gap-2">
            <select
              className="auth-input flex-1 text-sm"
              value={level}
              onChange={(e) => setLevel(e.target.value as PermissionLevel)}
            >
              <option value="read">{t('permissions.read')}</option>
              <option value="edit">{t('permissions.edit')}</option>
              <option value="manage">{t('permissions.manage')}</option>
            </select>
            <button
              type="submit"
              className="btn btn-secondary btn-sm shrink-0"
              disabled={saving || !username.trim()}
            >
              {saving ? (
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  {t('permissions.adding')}
                </span>
              ) : t('permissions.add')}
            </button>
          </div>
        </form>
      </div>

      <ErrorModal message={error} onClose={handleCloseError} />
    </div>
  );
}

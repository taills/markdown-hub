import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { adminService } from '@/services/api';
import { ErrorModal } from '@/components/ErrorModal';
import type { AdminLog } from '@/types';

export function AdminLogs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const handleCloseError = () => setError(null);

  useEffect(() => {
    if (!user?.is_admin) {
      navigate('/');
      return;
    }

    const fetchLogs = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await adminService.listAdminLogs(limit, offset);
        setLogs(data || []); // 确保始终是数组
      } catch (err) {
        setError(err instanceof Error ? err.message : t('admin.logsLoadError'));
        setLogs([]); // 发生错误时设为空数组
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [user, navigate, limit, offset]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatAction = (action: string) => {
    const actionMap: Record<string, () => string> = {
      SET_ADMIN: () => t('admin.setAdmin'),
      DELETE_USER: () => t('admin.deleteUser'),
      RESTORE_USER: () => t('admin.restoreUser'),
    };
    const formatter = actionMap[action];
    return formatter ? formatter() : action;
  };

  const formatDetails = (details?: Record<string, unknown>) => {
    if (!details) return '-';
    return JSON.stringify(details);
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h2>{t('admin.auditLogs')}</h2>
          <p className="text-sm text-gray-500 dark:text-neutral-400">{t('admin.logsDescription')}</p>
        </div>
        <div className="admin-actions">
          <button className="secondary" onClick={() => navigate('/admin/users')}>
            {t('admin.backToUsers')}
          </button>
          <button className="secondary" onClick={() => navigate('/me')}>
            {t('nav.backToProfile')}
          </button>
        </div>
      </header>

      {loading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <p className="text-sm text-gray-500 dark:text-neutral-400">{t('common.loading')}</p>
        </div>
      )}

      {!loading && !error && logs.length === 0 && (
        <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <span className="text-3xl mb-3 opacity-40">📋</span>
          <p className="text-sm text-gray-500 dark:text-neutral-400">{t('admin.noLogs')}</p>
        </div>
      )}

      {!loading && !error && logs.length > 0 && (
        <>
          <div className="logs-table-container">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>{t('admin.time')}</th>
                  <th>{t('admin.adminUser')}</th>
                  <th>{t('admin.action')}</th>
                  <th>{t('admin.target')}</th>
                  <th>{t('admin.details')}</th>
                  <th>{t('admin.ipAddress')}</th>
                  <th>{t('admin.userAgent')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="log-time">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="log-admin">
                      <span className="admin-badge">
                        {log.admin_username || t('admin.unknownUser')}
                      </span>
                    </td>
                    <td className="log-action">
                      <span className={`action-badge action-${log.action.toLowerCase()}`}>
                        {formatAction(log.action)}
                      </span>
                    </td>
                    <td className="log-target">
                      {log.target_username ? (
                        <>
                          <span className="target-type">{log.target_type}</span>
                          <span className="target-name">{log.target_username}</span>
                        </>
                      ) : (
                        <span className="text-sm text-gray-500 dark:text-neutral-400">{log.target_type || '-'}</span>
                      )}
                    </td>
                    <td className="log-details" title={formatDetails(log.details)}>
                      {formatDetails(log.details)}
                    </td>
                    <td className="log-ip">
                      <code>{log.ip_address || '-'}</code>
                    </td>
                    <td className="log-user-agent" style={{ width: '200px' }}>
                      <code>{log.user_agent || '-'}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button
              className="pagination-btn"
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
            >
              ← {t('common.previous')}
            </button>
            <span className="pagination-info">
              {t('common.page')} {Math.floor(offset / limit) + 1}
            </span>
            <button
              className="pagination-btn"
              onClick={() => setOffset(offset + limit)}
              disabled={logs.length < limit}
            >
              {t('common.next')} →
            </button>
          </div>
        </>
      )}

      <ErrorModal message={error ?? ''} onClose={handleCloseError} />
    </div>
  );
}

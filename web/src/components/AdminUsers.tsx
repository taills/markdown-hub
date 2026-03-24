import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { adminService } from '@/services/api';
import { ErrorModal } from '@/components/ErrorModal';
import type { User } from '@/types';

export function AdminUsers() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);
  const [resetPasswordResult, setResetPasswordResult] = useState<{ username: string; password: string } | null>(null);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');

  // Frontend permission check as additional protection
  useEffect(() => {
    if (!user?.is_admin) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleCloseError = () => setError('');

  const parseId = (uuidOrString: string | { id: string }): string => {
    if (typeof uuidOrString === 'object') {
      return uuidOrString.id;
    }
    return uuidOrString;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    adminService
      .listUsers()
      .then((data) => {
        if (!active) return;
        setUsers(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : t('common.error'));
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t]);

  const handleSetAdmin = async (userId: string, isAdmin: boolean) => {
    if (actionInProgress) return;
    setActionInProgress(true);
    try {
      await adminService.setUserAdmin(userId, isAdmin);
      // Update the user in the list
      setUsers((prev) =>
        prev.map((u) => (parseId(u.id) === userId ? { ...u, is_admin: isAdmin } : u))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!window.confirm(`${t('admin.confirmDelete')} ${username}?`)) {
      return;
    }
    if (actionInProgress) return;
    setActionInProgress(true);
    try {
      await adminService.deleteUser(userId);
      // Remove the user from the list
      setUsers((prev) => prev.filter((u) => parseId(u.id) !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setActionInProgress(false);
    }
  };

  const handleResetPassword = async (userId: string, username: string) => {
    if (!window.confirm(`${t('admin.confirmResetPassword')} ${username}?`)) {
      return;
    }
    if (actionInProgress) return;
    setActionInProgress(true);
    try {
      const result = await adminService.resetPassword(userId);
      setResetPasswordResult({ username, password: result.new_password });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setActionInProgress(false);
    }
  };

  const closeResetPasswordResult = () => setResetPasswordResult(null);

  const startEditEmail = (userId: string, currentEmail: string) => {
    setEditingEmail(userId);
    setEmailInput(currentEmail || '');
  };

  const cancelEditEmail = () => {
    setEditingEmail(null);
    setEmailInput('');
  };

  const saveEmail = async (userId: string) => {
    if (actionInProgress) return;
    setActionInProgress(true);
    try {
      const updatedUser = await adminService.updateEmail(userId, emailInput);
      setUsers((prev) =>
        prev.map((u) => (parseId(u.id) === userId ? { ...u, email: updatedUser.email } : u))
      );
      setEditingEmail(null);
      setEmailInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setActionInProgress(false);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h2>{t('admin.users')}</h2>
          <p className="text-sm text-gray-500 dark:text-neutral-400">{t('admin.usersDescription')}</p>
        </div>
        <div className="admin-actions">
          <button className="secondary" onClick={() => navigate('/admin/settings')}>
            {t('admin.siteSettings')}
          </button>
          <button className="secondary" onClick={() => navigate('/admin/logs')}>
            {t('admin.viewLogs')}
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

      {!loading && !error && (
        <div className="users-list">
          {users.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <span className="text-3xl mb-3 opacity-40">👥</span>
              <p className="text-sm text-gray-500 dark:text-neutral-400">{t('admin.noUsers')}</p>
            </div>
          ) : (
            <>
              <div className="users-stats">
                <div className="stat-card">
                  <div className="stat-value">{users.length}</div>
                  <div className="stat-label">{t('admin.totalUsers')}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{users.filter(u => u.is_admin).length}</div>
                  <div className="stat-label">{t('admin.adminUsers')}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{users.filter(u => !u.is_admin).length}</div>
                  <div className="stat-label">{t('admin.regularUsers')}</div>
                </div>
              </div>
              
              <div className="users-table-container">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>{t('admin.username')}</th>
                      <th>{t('admin.email')}</th>
                      <th>{t('admin.createdAt')}</th>
                      <th>{t('admin.role')}</th>
                      <th>{t('admin.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={parseId(user.id)} className={user.is_admin ? 'admin-row' : ''}>
                        <td className="user-name">
                          <div className="user-info-cell">
                            <div className="size-8 inline-flex justify-center items-center rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">
                              {user.username.charAt(0).toUpperCase()}
                            </div>
                            <span>{user.username}</span>
                          </div>
                        </td>
                        <td className="user-email">
                          {editingEmail === parseId(user.id) ? (
                            <div className="email-edit">
                              <input
                                type="email"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                placeholder={t('admin.emailPlaceholder')}
                                disabled={actionInProgress}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEmail(parseId(user.id));
                                  if (e.key === 'Escape') cancelEditEmail();
                                }}
                              />
                              <button
                                className="save-btn"
                                onClick={() => saveEmail(parseId(user.id))}
                                disabled={actionInProgress}
                                title={t('common.save')}
                              >
                                ✓
                              </button>
                              <button
                                className="cancel-btn"
                                onClick={cancelEditEmail}
                                disabled={actionInProgress}
                                title={t('common.cancel')}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <span
                              className="editable-email"
                              onClick={() => startEditEmail(parseId(user.id), user.email)}
                              title={t('admin.editEmail')}
                            >
                              {user.email || '-'}
                            </span>
                          )}
                        </td>
                        <td className="user-date">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="user-role">
                          <label className="admin-toggle">
                            <input
                              type="checkbox"
                              checked={user.is_admin}
                              onChange={(e) =>
                                handleSetAdmin(parseId(user.id), e.target.checked)
                              }
                              disabled={actionInProgress}
                            />
                            <span className="toggle-slider"></span>
                            <span className="toggle-label">
                              {user.is_admin ? t('admin.admin') : t('admin.user')}
                            </span>
                          </label>
                        </td>
                        <td className="user-actions">
                          <button
                            className="reset-password-btn"
                            onClick={() =>
                              handleResetPassword(parseId(user.id), user.username)
                            }
                            disabled={actionInProgress}
                            title={t('admin.resetPassword')}
                          >
                            🔑 {t('admin.resetPassword')}
                          </button>
                          <button
                            className="delete-btn"
                            onClick={() =>
                              handleDeleteUser(parseId(user.id), user.username)
                            }
                            disabled={actionInProgress}
                            title={t('admin.deleteUser')}
                          >
                            🗑️ {t('admin.delete')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <ErrorModal message={error} onClose={handleCloseError} />

      {resetPasswordResult && (
        <div className="hs-overlay open size-full fixed top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto" onClick={closeResetPasswordResult}>
          <div className="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all sm:max-w-lg sm:w-full m-3 sm:mx-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col bg-white border shadow-sm rounded-xl dark:bg-neutral-800 dark:border-neutral-700">
              <div className="flex items-center justify-between py-3 px-4 border-b border-gray-200 dark:border-neutral-700">
                <h3 className="font-semibold text-gray-800 dark:text-neutral-200">{t('admin.passwordResetSuccess')}</h3>
                <button className="size-8 inline-flex justify-center items-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-600" onClick={closeResetPasswordResult}>
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-4 py-4">
                <p className="text-sm text-gray-700 dark:text-neutral-300 mb-3">{t('admin.passwordResetMessage', { username: resetPasswordResult.username })}</p>
                <div className="bg-gray-100 dark:bg-neutral-700 rounded-md px-3 py-2 mb-3">
                  <code className="text-sm font-mono text-gray-900 dark:text-neutral-100">{resetPasswordResult.password}</code>
                </div>
                <p className="text-xs text-gray-500 dark:text-neutral-400">{t('admin.passwordResetWarning')}</p>
              </div>
              <div className="flex justify-end items-center gap-x-2 py-3 px-4 border-t border-gray-200 dark:border-neutral-700">
                <button className="py-2 px-4 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-transparent bg-blue-600 text-white hover:bg-blue-700" onClick={closeResetPasswordResult}>
                  {t('common.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
          <p className="muted">{t('admin.usersDescription')}</p>
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
          <p className="muted">{t('common.loading')}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="users-list">
          {users.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">👥</div>
              <p className="muted">{t('admin.noUsers')}</p>
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
                            <div className="user-avatar">
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
        <div className="modal-backdrop" onClick={closeResetPasswordResult}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('admin.passwordResetSuccess')}</h3>
            </div>
            <div className="modal-body">
              <p>{t('admin.passwordResetMessage', { username: resetPasswordResult.username })}</p>
              <div className="password-display">
                <code>{resetPasswordResult.password}</code>
              </div>
              <p className="muted">{t('admin.passwordResetWarning')}</p>
            </div>
            <div className="modal-actions">
              <button className="primary" onClick={closeResetPasswordResult}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

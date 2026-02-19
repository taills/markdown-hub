import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { userService } from '@/services/api';
import { languageOptions, type SupportedLanguage } from '@/i18n';
import { ErrorModal } from '@/components/ErrorModal';
import type { UserStats } from '@/types';

export function PersonalCenter() {
  const { user, updateUser, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    const raw = (user?.preferred_language || i18n.language) as SupportedLanguage;
    return raw || 'zh-CN';
  });
  const [languageSaving, setLanguageSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const modalError = passwordError || loadError;
  const handleCloseError = () => {
    setPasswordError('');
    setLoadError('');
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    userService
      .stats()
      .then((data) => {
        if (!active) return;
        setStats(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : t('profile.loadFailed'));
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    console.log('[PersonalCenter] Auth state:', {
      user,
      isAdmin: user?.is_admin,
      authLoading,
      userEmail: user?.email,
    });
    if (user?.preferred_language) {
      setLanguageState(user.preferred_language as SupportedLanguage);
    }
  }, [user?.preferred_language, user, authLoading]);

  const statsItems = useMemo(() => {
    if (!stats) return [];
    return [
      { label: t('profile.accessibleDocs'), value: stats.accessible_documents },
      { label: t('profile.ownedDocs'), value: stats.owned_documents },
      { label: t('profile.workspaces'), value: stats.workspaces },
      { label: t('profile.attachments'), value: stats.attachments_uploaded },
      { label: t('profile.snapshots'), value: stats.snapshots_authored },
    ];
  }, [stats, t]);

  const handleSaveLanguage = async () => {
    if (!language || languageSaving) return;
    setLanguageSaving(true);
    try {
      const updated = await userService.updatePreferences(language);
      updateUser(updated);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLanguageSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    if (!currentPassword || !newPassword) return;
    if (newPassword !== confirmPassword) {
      setPasswordError(t('profile.passwordMismatch'));
      return;
    }
    setPasswordSaving(true);
    try {
      await userService.updatePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(t('profile.passwordUpdated'));
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPasswordSaving(false);
    }
  };

  if (authLoading) {
    console.log('[PersonalCenter] Still loading auth...');
    return <div className="profile-page"><p>{t('common.loading')}</p></div>;
  }

  console.log('[PersonalCenter] Rendering with user:', { user, isAdmin: user?.is_admin, authLoading });

  return (
    <div className="profile-page">
      <header className="profile-header">
        <div>
          <h2>{t('profile.title')}</h2>
          <p className="muted">{user?.email}</p>
        </div>
        <div className="profile-header-buttons">
          {user?.is_admin && (
            <>
              <button className="secondary" onClick={() => navigate('/admin/users')}>
                {t('nav.admin')}
              </button>
              <button className="secondary" onClick={() => navigate('/admin/logs')}>
                {t('nav.adminLogs')}
              </button>
            </>
          )}
          <button className="secondary" onClick={() => navigate('/')}>
            {t('nav.backToEdit')}
          </button>
        </div>
      </header>

      <section className="profile-section">
        <h3>{t('profile.stats')}</h3>
        {loading && <p className="muted">{t('common.loading')}</p>}
        {!loading && !loadError && (
          <div className="stats-grid">
            {statsItems.map((item) => (
              <div key={item.label} className="stat-card">
                <span className="stat-label">{item.label}</span>
                <span className="stat-value">{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="profile-section">
        <h3>{t('profile.preferences')}</h3>
        <div className="profile-form">
          <label className="form-row">
            <span>{t('profile.language')}</span>
            <select
              value={language}
              onChange={(e) => setLanguageState(e.target.value as SupportedLanguage)}
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            onClick={handleSaveLanguage}
            disabled={languageSaving}
          >
            {languageSaving ? t('profile.languageSaving') : t('doc.save')}
          </button>
        </div>
      </section>

      <section className="profile-section">
        <h3>{t('profile.password')}</h3>
        <div className="profile-form">
          <label className="form-row">
            <span>{t('profile.currentPassword')}</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="form-row">
            <span>{t('profile.newPassword')}</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <label className="form-row">
            <span>{t('profile.confirmPassword')}</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
          {passwordSuccess && <p className="success">{passwordSuccess}</p>}
          <button
            className="primary"
            onClick={handleUpdatePassword}
            disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
          >
            {passwordSaving ? t('profile.updatingPassword') : t('profile.updatePassword')}
          </button>
        </div>
      </section>

      <ErrorModal message={modalError} onClose={handleCloseError} />
    </div>
  );
}

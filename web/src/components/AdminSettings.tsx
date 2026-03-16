import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { siteService } from '@/services/api';
import { ErrorModal } from '@/components/ErrorModal';

export function AdminSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [siteTitle, setSiteTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleCloseError = () => setError(null);

  useEffect(() => {
    if (!user?.is_admin) {
      navigate('/');
      return;
    }

    const fetchSettings = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch site title
        const titleData = await siteService.getAdminSiteTitle();
        setSiteTitle(titleData.value);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('admin.settingsLoadError'));
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [user, navigate, t]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await siteService.updateSiteTitle(siteTitle);
      setSuccess(t('admin.settingsSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.settingsSaveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p className="muted">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h2>{t('admin.siteSettings')}</h2>
          <p className="muted">{t('admin.siteSettingsDescription')}</p>
        </div>
        <div className="admin-actions">
          <button className="secondary" onClick={() => navigate('/admin/users')}>
            {t('admin.backToUsers')}
          </button>
          <button className="secondary" onClick={() => navigate('/admin/logs')}>
            {t('admin.viewLogs')}
          </button>
          <button className="secondary" onClick={() => navigate('/me')}>
            {t('nav.backToProfile')}
          </button>
        </div>
      </header>

      <div className="settings-card">
        <div className="settings-section">
          <div className="settings-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
          <div className="settings-content">
            <h3>{t('admin.siteTitle')}</h3>
            <p className="settings-description">{t('admin.siteTitleHint')}</p>
            <div className="settings-input-group">
              <input
                id="siteTitle"
                type="text"
                value={siteTitle}
                onChange={(e) => setSiteTitle(e.target.value)}
                placeholder={t('admin.siteTitlePlaceholder')}
                maxLength={255}
                className="settings-input"
              />
              <button
                className="primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
            {success && (
              <div className="success-message">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {success}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="settings-tips">
        <h4>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          {t('admin.settingsTips', '使用提示')}
        </h4>
        <ul>
          <li>{t('admin.settingsTip1', '站点标题会显示在浏览器的标签页上')}</li>
          <li>{t('admin.settingsTip2', '更改后，所有用户将立即看到新的标题')}</li>
        </ul>
      </div>

      <ErrorModal message={error ?? ''} onClose={handleCloseError} />
    </div>
  );
}

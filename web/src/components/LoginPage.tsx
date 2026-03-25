import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ErrorModal } from '@/components/ErrorModal';
import { languageOptions, setLanguage, type SupportedLanguage } from '@/i18n';

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLanguageChange = (lang: SupportedLanguage) => {
    setLanguage(lang);
  };

  const handleCloseError = () => setError('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'register' && password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, email, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.unknownError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-language-selector">
        <select
          value={i18n.language}
          onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
          aria-label={t('profile.language')}
        >
          {languageOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-logo">{t('app.title', 'MarkdownHub')}</h1>
          <p className="auth-tagline">
            {t('app.tagline', '知识分享 · 协作写作 · Markdown创作平台')}
          </p>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
          >
            {t('auth.signIn', '登录')}
          </button>
          <button
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
          >
            {t('auth.register', '注册')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="text"
            className="auth-input"
            placeholder={t('auth.username', '用户名')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={isSubmitting}
          />

          {mode === 'register' && (
            <input
              type="email"
              className="auth-input"
              placeholder={t('auth.email', '邮箱') + ' (' + t('auth.optional', '可选') + ')'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
            />
          )}

          <input
            type="password"
            className="auth-input"
            placeholder={t('auth.password', '密码')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isSubmitting}
          />

          {mode === 'register' && (
            <input
              type="password"
              className="auth-input"
              placeholder={t('auth.confirmPassword', '确认密码')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isSubmitting}
            />
          )}

          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting
              ? t('auth.loading', '处理中...')
              : mode === 'login'
                ? t('auth.signIn', '登录')
                : t('auth.register', '注册')}
          </button>
        </form>

        {mode === 'login' && (
          <p className="auth-footer">
            {t('auth.noAccount', '还没有账号？')}
            <Link to="/register"> {t('auth.register', '立即注册')}</Link>
          </p>
        )}

        {mode === 'register' && (
          <p className="auth-footer">
            {t('auth.hasAccount', '已有账号？')}
            <Link to="/login"> {t('auth.signIn', '立即登录')}</Link>
          </p>
        )}
      </div>

      <ErrorModal message={error} onClose={handleCloseError} />
    </div>
  );
}

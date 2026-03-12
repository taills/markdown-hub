import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
    
    // 验证注册时两次密码是否一致
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
      <h1>{t('app.title')}</h1>
      <p className="tagline">{t('app.tagline')}</p>
      <div className="auth-form-container">
        <div className="auth-tabs">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            {t('auth.signIn')}
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            {t('auth.register')}
          </button>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <input
              type="text"
              placeholder={t('auth.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          )}
          {mode === 'login' && (
            <input
              type="text"
              placeholder={t('auth.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          )}
          {mode === 'register' && (
            <input
              type="email"
              placeholder={t('auth.email') + ' (' + t('auth.optional') + ')'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
          <input
            type="password"
            placeholder={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {mode === 'register' && (
            <input
              type="password"
              placeholder={t('auth.confirmPassword')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          )}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('auth.loading') : mode === 'login' ? t('auth.signIn') : t('auth.register')}
          </button>
        </form>
      </div>

      <ErrorModal message={error} onClose={handleCloseError} />
    </div>
  );
}

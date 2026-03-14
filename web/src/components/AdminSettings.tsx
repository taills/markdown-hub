import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { siteService } from '@/services/api';
import { ErrorModal } from '@/components/ErrorModal';

interface LLMConfigState {
  enable: boolean;
  base_url: string;
  api_key: string;
  name: string;
  context_length: number;
  model_type: 'text' | 'multimodal';
}

interface EmbeddingConfigState {
  enable: boolean;
  base_url: string;
  api_key: string;
  name: string;
  dimensions: number;
  model_type: 'embedding';
}

const defaultLLMConfig: LLMConfigState = {
  enable: false,
  base_url: '',
  api_key: '',
  name: '',
  context_length: 128000,
  model_type: 'text',
};

const defaultEmbeddingConfig: EmbeddingConfigState = {
  enable: false,
  base_url: '',
  api_key: '',
  name: '',
  dimensions: 1536,
  model_type: 'embedding',
};

export function AdminSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [siteTitle, setSiteTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // LLM Config states
  const [textModelConfig, setTextModelConfig] = useState<LLMConfigState>(defaultLLMConfig);
  const [multimodalConfig, setMultimodalConfig] = useState<LLMConfigState>({ ...defaultLLMConfig, model_type: 'multimodal' });
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmSaving, setLlmSaving] = useState(false);
  const [testingText, setTestingText] = useState(false);
  const [testingMulti, setTestingMulti] = useState(false);
  const [textTestResult, setTextTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [multiTestResult, setMultiTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Embedding Config states
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfigState>(defaultEmbeddingConfig);
  const [embeddingLoading, setEmbeddingLoading] = useState(true);
  const [embeddingSaving, setEmbeddingSaving] = useState(false);
  const [testingEmbedding, setTestingEmbedding] = useState(false);
  const [embeddingTestResult, setEmbeddingTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleCloseError = () => setError(null);

  useEffect(() => {
    if (!user?.is_admin) {
      navigate('/');
      return;
    }

    const fetchSettings = async () => {
      try {
        setLoading(true);
        setLlmLoading(true);
        setEmbeddingLoading(true);
        setError(null);

        // Fetch site title
        const titleData = await siteService.getAdminSiteTitle();
        setSiteTitle(titleData.value);

        // Fetch LLM configs (these must succeed)
        const [textConfig, multiConfig] = await Promise.all([
          siteService.getLLMConfig('text'),
          siteService.getLLMConfig('multimodal'),
        ]);

        setTextModelConfig({
          enable: textConfig.enable,
          base_url: textConfig.base_url,
          api_key: textConfig.api_key,
          name: textConfig.name,
          context_length: textConfig.context_length,
          model_type: 'text',
        });

        setMultimodalConfig({
          enable: multiConfig.enable,
          base_url: multiConfig.base_url,
          api_key: multiConfig.api_key,
          name: multiConfig.name,
          context_length: multiConfig.context_length,
          model_type: 'multimodal',
        });

        // Fetch embedding config (optional - don't fail if it errors)
        try {
          const embeddingConfigData = await siteService.getEmbeddingConfig();
          setEmbeddingConfig({
            enable: embeddingConfigData.enable,
            base_url: embeddingConfigData.base_url,
            api_key: embeddingConfigData.api_key,
            name: embeddingConfigData.name,
            dimensions: embeddingConfigData.dimensions,
            model_type: 'embedding',
          });
        } catch {
          // Use default embedding config if API not available
          setEmbeddingConfig(defaultEmbeddingConfig);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('admin.settingsLoadError'));
      } finally {
        setLoading(false);
        setLlmLoading(false);
        setEmbeddingLoading(false);
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

  const handleLLMSave = async (config: LLMConfigState, setConfig: React.Dispatch<React.SetStateAction<LLMConfigState>>) => {
    // Validate if enable is true
    if (config.enable && (!config.base_url || !config.api_key || !config.name)) {
      setError(t('admin.llmRequiredFields'));
      return;
    }

    try {
      setLlmSaving(true);
      setError(null);

      await siteService.updateLLMConfig(config);
      setConfig({
        ...config,
        api_key: '', // Clear API key in UI for security
      });

      setSuccess(t('admin.llmConfigSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.llmSaveError'));
    } finally {
      setLlmSaving(false);
    }
  };

  const handleLLMTest = async (config: LLMConfigState, setResult: React.Dispatch<React.SetStateAction<{ success: boolean; message: string } | null>>) => {
    if (!config.base_url || !config.api_key || !config.name) {
      setError(t('admin.llmRequiredFields'));
      return;
    }

    try {
      if (config.model_type === 'text') {
        setTestingText(true);
      } else {
        setTestingMulti(true);
      }
      setError(null);
      setResult(null);

      const result = await siteService.testLLMConfig(config);
      setResult({ success: result.success, message: result.message });
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : t('admin.llmTestError'),
      });
    } finally {
      setTestingText(false);
      setTestingMulti(false);
    }
  };

  const handleEmbeddingTest = async () => {
    if (!embeddingConfig.base_url || !embeddingConfig.api_key || !embeddingConfig.name) {
      setError(t('admin.llmRequiredFields'));
      return;
    }

    try {
      setTestingEmbedding(true);
      setError(null);
      setEmbeddingTestResult(null);

      const result = await siteService.testEmbeddingConfig(embeddingConfig);
      setEmbeddingTestResult({ success: result.success, message: result.message });
    } catch (err) {
      setEmbeddingTestResult({
        success: false,
        message: err instanceof Error ? err.message : t('admin.llmTestError'),
      });
    } finally {
      setTestingEmbedding(false);
    }
  };

  const handleEmbeddingSave = async () => {
    try {
      setEmbeddingSaving(true);
      setError(null);
      setSuccess(null);

      await siteService.updateEmbeddingConfig(embeddingConfig);
      setSuccess(t('admin.settingsSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.settingsSaveError'));
    } finally {
      setEmbeddingSaving(false);
    }
  };

  if (loading || llmLoading || embeddingLoading) {
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

      {/* LLM Text Model Configuration */}
      <div className="settings-card">
        <div className="settings-section">
          <div className="settings-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <div className="settings-content">
            <h3>{t('admin.llmTextModel')}</h3>
            <p className="settings-description">{t('admin.llmTextModelHint')}</p>

            <div className="settings-checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={textModelConfig.enable}
                  onChange={(e) => setTextModelConfig({ ...textModelConfig, enable: e.target.checked })}
                />
                <span>{t('admin.llmEnable')}</span>
              </label>
            </div>

            <div className="llm-config-form">
              <div className="form-group">
                <label htmlFor="textBaseURL">{t('admin.llmBaseURL')}</label>
                <input
                  id="textBaseURL"
                  type="text"
                  value={textModelConfig.base_url}
                  onChange={(e) => setTextModelConfig({ ...textModelConfig, base_url: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  disabled={!textModelConfig.enable}
                  className="settings-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="textAPIKey">{t('admin.llmAPIKey')}</label>
                <input
                  id="textAPIKey"
                  type="password"
                  value={textModelConfig.api_key}
                  onChange={(e) => setTextModelConfig({ ...textModelConfig, api_key: e.target.value })}
                  placeholder={textModelConfig.api_key ? '********' : t('admin.llmAPIKeyPlaceholder')}
                  disabled={!textModelConfig.enable}
                  className="settings-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="textModelName">{t('admin.llmModelName')}</label>
                <input
                  id="textModelName"
                  type="text"
                  value={textModelConfig.name}
                  onChange={(e) => setTextModelConfig({ ...textModelConfig, name: e.target.value })}
                  placeholder="gpt-4"
                  disabled={!textModelConfig.enable}
                  className="settings-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="textContextLength">{t('admin.llmContextLength')}</label>
                <input
                  id="textContextLength"
                  type="number"
                  value={textModelConfig.context_length}
                  onChange={(e) => setTextModelConfig({ ...textModelConfig, context_length: parseInt(e.target.value) || 128000 })}
                  placeholder="128000"
                  disabled={!textModelConfig.enable}
                  className="settings-input"
                />
              </div>

              <div className="llm-actions">
                <button
                  className="secondary"
                  onClick={() => handleLLMTest(textModelConfig, setTextTestResult)}
                  disabled={testingText || !textModelConfig.enable || !textModelConfig.base_url || !textModelConfig.api_key || !textModelConfig.name}
                >
                  {testingText ? t('admin.llmTesting') : t('admin.llmTest')}
                </button>
                <button
                  className="primary"
                  onClick={() => handleLLMSave(textModelConfig, setTextModelConfig)}
                  disabled={llmSaving}
                >
                  {llmSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>

              {/* Text Model Test Result */}
              {textTestResult && (
                <div className={`test-result ${textTestResult.success ? 'success' : 'error'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {textTestResult.success ? (
                      <polyline points="20 6 9 17 4 12"/>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                      </>
                    )}
                  </svg>
                  {textTestResult.message}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* LLM Multimodal Model Configuration */}
      <div className="settings-card">
        <div className="settings-section">
          <div className="settings-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <div className="settings-content">
            <h3>{t('admin.llmMultimodalModel')}</h3>
            <p className="settings-description">{t('admin.llmMultimodalModelHint')}</p>

            <div className="settings-checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={multimodalConfig.enable}
                  onChange={(e) => setMultimodalConfig({ ...multimodalConfig, enable: e.target.checked })}
                />
                <span>{t('admin.llmEnable')}</span>
              </label>
            </div>

            <div className="llm-config-form">
              <div className="form-group">
                <label htmlFor="multiBaseURL">{t('admin.llmBaseURL')}</label>
                <input
                  id="multiBaseURL"
                  type="text"
                  value={multimodalConfig.base_url}
                  onChange={(e) => setMultimodalConfig({ ...multimodalConfig, base_url: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  disabled={!multimodalConfig.enable}
                  className="settings-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="multiAPIKey">{t('admin.llmAPIKey')}</label>
                <input
                  id="multiAPIKey"
                  type="password"
                  value={multimodalConfig.api_key}
                  onChange={(e) => setMultimodalConfig({ ...multimodalConfig, api_key: e.target.value })}
                  placeholder={multimodalConfig.api_key ? '********' : t('admin.llmAPIKeyPlaceholder')}
                  disabled={!multimodalConfig.enable}
                  className="settings-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="multiModelName">{t('admin.llmModelName')}</label>
                <input
                  id="multiModelName"
                  type="text"
                  value={multimodalConfig.name}
                  onChange={(e) => setMultimodalConfig({ ...multimodalConfig, name: e.target.value })}
                  placeholder="gpt-4o"
                  disabled={!multimodalConfig.enable}
                  className="settings-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="multiContextLength">{t('admin.llmContextLength')}</label>
                <input
                  id="multiContextLength"
                  type="number"
                  value={multimodalConfig.context_length}
                  onChange={(e) => setMultimodalConfig({ ...multimodalConfig, context_length: parseInt(e.target.value) || 128000 })}
                  placeholder="128000"
                  disabled={!multimodalConfig.enable}
                  className="settings-input"
                />
              </div>

              <div className="llm-actions">
                <button
                  className="secondary"
                  onClick={() => handleLLMTest(multimodalConfig, setMultiTestResult)}
                  disabled={testingMulti || !multimodalConfig.enable || !multimodalConfig.base_url || !multimodalConfig.api_key || !multimodalConfig.name}
                >
                  {testingMulti ? t('admin.llmTesting') : t('admin.llmTest')}
                </button>
                <button
                  className="primary"
                  onClick={() => handleLLMSave(multimodalConfig, setMultimodalConfig)}
                  disabled={llmSaving}
                >
                  {llmSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>

              {/* Multimodal Model Test Result */}
              {multiTestResult && (
                <div className={`test-result ${multiTestResult.success ? 'success' : 'error'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {multiTestResult.success ? (
                      <polyline points="20 6 9 17 4 12"/>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                      </>
                    )}
                  </svg>
                  {multiTestResult.message}
                </div>
              )}
            </div>
          </div>

          {/* Embedding Model Configuration */}
          <div className="settings-card">
            <h3>{t('admin.embeddingModel', 'Embedding 模型配置')}</h3>
            <div className="llm-config-form">
              <div className="checkbox-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={embeddingConfig.enable}
                    onChange={(e) => setEmbeddingConfig({ ...embeddingConfig, enable: e.target.checked })}
                  />
                  <span>{t('admin.llmEnable')}</span>
                </label>
              </div>

              <div className="form-group">
                <label htmlFor="embBaseURL">{t('admin.llmBaseURL')}</label>
                <input
                  id="embBaseURL"
                  type="text"
                  value={embeddingConfig.base_url}
                  onChange={(e) => setEmbeddingConfig({ ...embeddingConfig, base_url: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  disabled={!embeddingConfig.enable}
                  className="settings-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="embAPIKey">{t('admin.llmAPIKey')}</label>
                <input
                  id="embAPIKey"
                  type="password"
                  value={embeddingConfig.api_key}
                  onChange={(e) => setEmbeddingConfig({ ...embeddingConfig, api_key: e.target.value })}
                  placeholder={embeddingConfig.api_key ? '********' : t('admin.llmAPIKeyPlaceholder')}
                  disabled={!embeddingConfig.enable}
                  className="settings-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="embModelName">{t('admin.embeddingModelName', '模型名称')}</label>
                <input
                  id="embModelName"
                  type="text"
                  value={embeddingConfig.name}
                  onChange={(e) => setEmbeddingConfig({ ...embeddingConfig, name: e.target.value })}
                  placeholder="text-embedding-ada-002"
                  disabled={!embeddingConfig.enable}
                  className="settings-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="embDimensions">{t('admin.embeddingDimensions', '维度')}</label>
                <input
                  id="embDimensions"
                  type="number"
                  value={embeddingConfig.dimensions}
                  onChange={(e) => setEmbeddingConfig({ ...embeddingConfig, dimensions: parseInt(e.target.value) || 1536 })}
                  placeholder="1536"
                  disabled={!embeddingConfig.enable}
                  className="settings-input"
                />
                <span className="form-hint">{t('admin.embeddingDimensionsHint', '常用维度: 1536 (OpenAI), 1024 (Cohere)')}</span>
              </div>

              <div className="llm-actions">
                <button
                  className="secondary"
                  onClick={handleEmbeddingTest}
                  disabled={testingEmbedding || !embeddingConfig.enable || !embeddingConfig.base_url || !embeddingConfig.api_key || !embeddingConfig.name}
                >
                  {testingEmbedding ? t('admin.llmTesting') : t('admin.llmTest')}
                </button>
                <button
                  className="primary"
                  onClick={handleEmbeddingSave}
                  disabled={embeddingSaving}
                >
                  {embeddingSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>

              {/* Embedding Test Result */}
              {embeddingTestResult && (
                <div className={`test-result ${embeddingTestResult.success ? 'success' : 'error'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {embeddingTestResult.success ? (
                      <polyline points="20 6 9 17 4 12"/>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                      </>
                    )}
                  </svg>
                  {embeddingTestResult.message}
                </div>
              )}
            </div>
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

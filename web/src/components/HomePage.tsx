import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { homeService, siteService } from '@/services/api';
import type { Document, Workspace } from '@/types';

interface HomeData {
  workspaces: Workspace[];
  documents: Document[];
}

/**
 * HomePage — displays public workspaces and documents for anonymous users
 * Accessible at / without authentication
 */
export function HomePage() {
  const { t } = useTranslation();
  const [data, setData] = useState<HomeData | null>(null);
  const [siteTitle, setSiteTitle] = useState<string>('MarkdownHub');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch site title and home data in parallel
    Promise.all([
      homeService.getData(),
      siteService.getSiteTitle().catch(() => 'MarkdownHub'),
    ])
      .then(([homeData, title]) => {
        setData(homeData);
        setSiteTitle(title);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="home-page">
        <div className="loading">{t('common.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="home-page">
        <div className="home-error">{error}</div>
      </div>
    );
  }

  const hasPublicContent = (data?.workspaces.length ?? 0) > 0 || (data?.documents.length ?? 0) > 0;

  return (
    <div className="home-page">
      <header className="home-header">
        <h1 className="home-title">{siteTitle}</h1>
        <p className="home-subtitle">{t('home.subtitle')}</p>
      </header>

      {!hasPublicContent ? (
        <div className="home-empty">
          <p>{t('home.noPublicContent', '暂无公开内容')}</p>
        </div>
      ) : (
        <>
          {data?.workspaces && data.workspaces.length > 0 && (
            <section className="home-section">
              <h2 className="home-section-title">{t('home.publicWorkspaces', '公开工作空间')}</h2>
              <div className="home-workspaces">
                {data.workspaces.map((ws) => (
                  <Link
                    key={ws.id}
                    to={`/workspaces/${ws.id}/view`}
                    className="home-workspace-card"
                  >
                    <h3 className="home-workspace-name">{ws.name}</h3>
                    <span className="home-workspace-meta">
                      {t('common.updated')}: {new Date(ws.updated_at).toLocaleDateString()}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data?.documents && data.documents.length > 0 && (
            <section className="home-section">
              <h2 className="home-section-title">{t('home.publicDocuments', '公开文档')}</h2>
              <div className="home-documents">
                {data.documents.map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/documents/${doc.id}/view`}
                    className="home-document-card"
                  >
                    <h3 className="home-document-title">{doc.title || t('home.untitled', '无标题')}</h3>
                    <span className="home-document-meta">
                      {t('common.updated')}: {new Date(doc.updated_at).toLocaleDateString()}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <footer className="home-footer">
        <Link to="/login" className="home-login-link">{t('home.login', '登录')}</Link>
      </footer>
    </div>
  );
}

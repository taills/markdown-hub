import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { workspaceService } from '@/services/api';
import { ErrorModal } from '@/components/ErrorModal';
import type { Document, Workspace } from '@/types';

/**
 * PublicWorkspaceView — renders a public workspace and its public documents
 * for anonymous users. Accessible at /workspaces/:id/view without authentication.
 */
export function PublicWorkspaceView() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const getExcerpt = (content: string, maxLength: number = 200): string => {
    if (!content) return '';
    const stripped = content.replace(/[#*`\[\]()]/g, '').trim();
    return stripped.length > maxLength
      ? stripped.substring(0, maxLength) + '...'
      : stripped;
  };

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);

    Promise.all([
      workspaceService.getPublic(id),
      workspaceService.getPublicDocuments(id),
    ])
      .then(([ws, docs]) => {
        if (!ws.is_public) {
          setError(t('common.error'));
          return;
        }
        setWorkspace(ws);
        setDocuments(docs);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [id, t]);

  if (isLoading) {
    return (
      <div className="public-doc-shell">
        <div className="loading">{t('common.loading')}</div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="public-doc-shell">
        <ErrorModal
          message={error ?? t('common.error')}
          onClose={() => window.history.back()}
        />
      </div>
    );
  }

  return (
    <div className="public-doc-shell">
      <header className="public-doc-header">
        <div className="public-doc-toolbar public-doc-toolbar-single">
          <div className="public-doc-nav">
            <Link to="/home" className="public-doc-nav-link">
              {t('nav.home')}
            </Link>
          </div>
        </div>
      </header>
      <main className="public-doc-content public-workspace-content">
        <section className="blog-section public-workspace-section">
          <div className="blog-section-header public-workspace-section-header">
            <h2 className="blog-section-title public-workspace-docs-heading">
              {workspace.name}
            </h2>
            <p className="blog-section-subtitle">
              {t('common.updated')}: {new Date(workspace.updated_at).toLocaleString()}
            </p>
          </div>

        {documents.length === 0 ? (
            <p className="text-center text-sm text-gray-500 dark:text-neutral-400 py-12">{t('workspace.publicViewNoDocuments')}</p>
        ) : (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
                <article key={doc.id} className="flex flex-col gap-2 p-5 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl hover:shadow-md transition-shadow">
                  <Link
                    to={`/documents/${doc.id}/view`}
                    className="group"
                  >
                    <h3 className="text-base font-medium text-gray-900 dark:text-neutral-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {doc.title || t('home.untitled', '无标题文档')}
                    </h3>
                  </Link>

                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
                    <time>
                      {new Date(doc.updated_at).toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </time>
                    <span>·</span>
                    <span>
                      {t('home.readTime', '{{min}} 分钟阅读', {
                        min: Math.max(1, Math.ceil(doc.content.length / 400)),
                      })}
                    </span>
                  </div>

                  {doc.content && (
                    <p className="text-sm text-gray-600 dark:text-neutral-400 line-clamp-3">
                      {getExcerpt(doc.content)}
                    </p>
                  )}

                <Link
                  to={`/documents/${doc.id}/view`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline mt-auto"
                >
                  {t('home.readMore', '阅读全文')}
                  <svg className="size-3" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Link>

                </article>
            ))}
            </div>
        )}
        </section>
      </main>
    </div>
  );
}

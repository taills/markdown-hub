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
        <div className="public-doc-title-row">
          <h1 className="public-doc-title">{workspace.name}</h1>
          <span className="public-badge">🌐 {t('workspace.setPublic')}</span>
        </div>
        <p className="public-doc-meta">
          {t('common.updated')}: {new Date(workspace.updated_at).toLocaleString()}
        </p>
      </header>
      <main className="public-doc-content">
        <h2 className="public-workspace-docs-heading">{t('workspace.publicViewDocuments')}</h2>
        {documents.length === 0 ? (
          <p className="empty">{t('workspace.publicViewNoDocuments')}</p>
        ) : (
          <ul className="public-workspace-doc-list">
            {documents.map((doc) => (
              <li key={doc.id} className="public-workspace-doc-item">
                <Link
                  to={`/documents/${doc.id}/view`}
                  className="public-workspace-doc-link"
                >
                  {doc.title || doc.id}
                </Link>
                <span className="public-workspace-doc-date">
                  {new Date(doc.updated_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { documentService, workspaceService } from '@/services/api';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { ErrorModal } from '@/components/ErrorModal';
import type { Document, Workspace } from '@/types';

/**
 * PublicDocumentView — renders a public document for anonymous users.
 * Accessible at /documents/:id/view without authentication.
 */
export function PublicDocumentView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [document, setDocument] = useState<Document | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setWorkspace(null);
    documentService
      .getPublic(id)
      .then(async (doc) => {
        if (!doc.is_public) {
          setError(t('common.error'));
          return;
        }
        setDocument(doc);

        if (doc.workspace_id) {
          try {
            const ws = await workspaceService.getPublic(doc.workspace_id);
            setWorkspace(ws);
          } catch {
            setWorkspace(null);
          }
        }
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

  if (error || !document) {
    return (
      <div className="public-doc-shell">
        <ErrorModal
          message={error ?? t('common.error')}
          onClose={() => navigate(-1)}
        />
      </div>
    );
  }

  return (
    <div className="public-doc-shell">
      <header className="public-doc-header">
        <div className="public-doc-toolbar public-doc-toolbar-document">
          <div className="public-doc-nav">
            <Link to="/home" className="public-doc-nav-link">
              {t('nav.home')}
            </Link>
            <Link
              to={`/workspaces/${document.workspace_id}/view`}
              className="public-doc-nav-link"
            >
              {workspace?.name || t('nav.workspace')}
            </Link>
            <Link
              to={`/api/documents/${document.id}/raw`}
              target="_blank"
              rel="noopener noreferrer"
              className="public-doc-nav-link"
            >
              {t('doc.viewRaw')}
            </Link>
          </div>
        </div>

        <div className="public-doc-title-row">
          <div className="public-doc-title-group">
            <span className="public-badge">{t('doc.public', '公开文档')}</span>
            <h1 className="public-doc-title">
              {document.title || t('home.untitled', '无标题文档')}
            </h1>
            <p className="public-doc-meta">
              {t('common.updated')}: {new Date(document.updated_at).toLocaleString()}
            </p>
          </div>
        </div>
      </header>
      <main className="public-doc-content">
        <MarkdownPreview content={document.content} />
      </main>
    </div>
  );
}

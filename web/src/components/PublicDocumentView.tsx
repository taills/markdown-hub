import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { documentService } from '@/services/api';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { ErrorModal } from '@/components/ErrorModal';
import type { Document } from '@/types';

/**
 * PublicDocumentView — renders a public document for anonymous users.
 * Accessible at /documents/:id/view without authentication.
 */
export function PublicDocumentView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    documentService
      .getPublic(id)
      .then((doc) => {
        if (!doc.is_public) {
          setError(t('common.error'));
          return;
        }
        setDocument(doc);
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
        <div className="public-doc-title-row">
          <h1 className="public-doc-title">{document.title}</h1>
          <div className="public-doc-actions">
            <span className="public-badge">🌐 {t('doc.setPublic')}</span>
            <Link
              to={`/api/documents/${document.id}/raw`}
              target="_blank"
              rel="noopener noreferrer"
              className="public-doc-raw-link"
            >
              {t('doc.viewRaw')}
            </Link>
          </div>
        </div>
        <p className="public-doc-meta">
          {t('common.updated')}: {new Date(document.updated_at).toLocaleString()}
        </p>
      </header>
      <main className="public-doc-content">
        <MarkdownPreview content={document.content} />
      </main>
    </div>
  );
}

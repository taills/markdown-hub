import { useState, useEffect } from 'react';
import type { Document, DocumentListItem } from '@/types';
import { documentService } from '@/services/api';

export function useDocument(id: string) {
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setDocument(null);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    documentService
      .get(id)
      .then(setDocument)
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [id]);

  return { document, setDocument, isLoading, error };
}

export function useDocumentList() {
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setIsLoading(true);
    documentService
      .list()
      .then((docs) => setDocuments(docs ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(reload, []);

  return { documents, isLoading, error, reload };
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentList } from '@/hooks/useDocument';
import { useAuth } from '@/hooks/useAuth';
import { documentService } from '@/services/api';
import type { DocumentListItem } from '@/types';

export function DocumentList() {
  const { documents, isLoading, reload } = useDocumentList();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    setError('');
    try {
      const doc = await documentService.create(newTitle.trim());
      navigate(`/documents/${doc.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    await documentService.delete(id).catch(() => null);
    reload();
  };

  const getPermissionBadge = (doc: DocumentListItem) => {
    if (doc.owner_id === user?.id) {
      return <span className="badge badge-owner">Owner</span>;
    }
    if (doc.permission) {
      return <span className={`badge badge-${doc.permission}`}>{doc.permission}</span>;
    }
    return null;
  };

  return (
    <div className="document-list-page">
      <header>
        <h1>MarkdownHub</h1>
        <div className="user-info">
          <span>{user?.username}</span>
          <button onClick={logout}>Sign out</button>
        </div>
      </header>

      <div className="new-document">
        <input
          type="text"
          placeholder="New document title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button onClick={handleCreate} disabled={creating || !newTitle.trim()}>
          {creating ? 'Creating…' : 'New Document'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <ul className="document-items">
          {(documents ?? []).map((doc) => (
            <li key={doc.id} className="document-item">
              <button className="doc-link" onClick={() => navigate(`/documents/${doc.id}`)}>
                <span className="doc-title">{doc.title}</span>
                {getPermissionBadge(doc)}
                <span className="doc-date">{new Date(doc.updated_at).toLocaleDateString()}</span>
              </button>
              {doc.owner_id === user?.id && (
                <button className="doc-delete" onClick={() => handleDelete(doc.id)}>
                  Delete
                </button>
              )}
            </li>
          ))}
          {documents?.length === 0 && <li className="empty">No documents yet.</li>}
        </ul>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { snapshotService } from '@/services/api';
import { DiffView } from '@/components/MarkdownPreview';
import type { Snapshot, Document, DiffLine } from '@/types';

interface SnapshotPanelProps {
  documentId: string;
  onRestore: (doc: Document) => void;
}

export function SnapshotPanel({ documentId, onRestore }: SnapshotPanelProps) {
  const { t, i18n } = useTranslation();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffLine[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    setIsLoading(true);
    snapshotService
      .list(documentId)
      .then((s) => setSnapshots(s ?? []))
      .catch(() => null)
      .finally(() => setIsLoading(false));
  };

  useEffect(load, [documentId]);

  const handleSelect = async (snap: Snapshot) => {
    setSelectedId(snap.id);
    setDiffLoading(true);
    setDiff(null);
    const compareId = snapshots.find((_s, i) => snapshots[i - 1]?.id === snap.id)?.id;
    try {
      const d = await snapshotService.diff(snap.id, compareId);
      setDiff(d);
    } catch {
      setDiff(null);
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedId) return;
    setRestoring(true);
    try {
      const doc = await snapshotService.restore(selectedId);
      onRestore(doc);
    } catch {
      // handle error
    } finally {
      setRestoring(false);
    }
  };

  const handleCreateSnapshot = async () => {
    if (!message.trim()) return;
    setCreating(true);
    try {
      await snapshotService.create(documentId, message.trim());
      setMessage('');
      load();
    } catch {
      // handle error
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="snapshot-panel">
      <div className="snapshot-create">
        <input
          type="text"
          placeholder={t('snapshots.messagePlaceholder')}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button onClick={handleCreateSnapshot} disabled={creating || !message.trim()}>
          {creating ? t('snapshots.saving') : t('snapshots.save')}
        </button>
      </div>

      {isLoading ? (
        <p>{t('snapshots.loadingHistory')}</p>
      ) : (
        <ul className="snapshot-list">
          {snapshots.map((snap) => (
            <li
              key={snap.id}
              className={`snapshot-item ${selectedId === snap.id ? 'selected' : ''}`}
              onClick={() => handleSelect(snap)}
            >
              <span className="snap-message">{snap.message || t('snapshots.noMessage')}</span>
              <span className="snap-date">{new Date(snap.created_at).toLocaleString(i18n.language)}</span>
            </li>
          ))}
          {snapshots.length === 0 && <li className="empty">{t('snapshots.empty')}</li>}
        </ul>
      )}

      {selectedId && (
        <div className="snapshot-actions">
          <button onClick={handleRestore} disabled={restoring}>
            {restoring ? t('snapshots.restoring') : t('snapshots.restore')}
          </button>
        </div>
      )}

      {diffLoading && <p>{t('snapshots.loadingDiff')}</p>}
      {diff && <DiffView lines={diff} />}
    </div>
  );
}

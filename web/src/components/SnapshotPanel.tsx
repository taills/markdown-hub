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
    <div className="flex flex-col h-full overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-neutral-800 shrink-0">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-neutral-500">
          {t('snapshots.title', '历史快照')}
        </span>
      </div>

      {/* 创建快照区域 */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            className="auth-input flex-1 text-sm"
            placeholder={t('snapshots.messagePlaceholder')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateSnapshot()}
          />
          <button
            className="btn btn-secondary btn-sm shrink-0"
            onClick={handleCreateSnapshot}
            disabled={creating || !message.trim()}
          >
            {creating ? t('snapshots.saving') : t('snapshots.save')}
          </button>
        </div>
      </div>

      {/* 快照列表 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-[#c9940a] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-400 dark:text-neutral-500">{t('snapshots.loadingHistory')}</span>
            </div>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            {/* 时钟图标 */}
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e5e5e5" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p className="text-sm" style={{ color: 'var(--meta-gray)' }}>{t('snapshots.empty')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
            {snapshots.map((snap) => (
              <li
                key={snap.id}
                onClick={() => handleSelect(snap)}
                className={[
                  'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
                  selectedId === snap.id
                    ? 'bg-[#fdf8ee] dark:bg-neutral-800 border-l-2 border-[#c9940a]'
                    : 'hover:bg-gray-50 dark:hover:bg-neutral-800/50 border-l-2 border-transparent',
                ].join(' ')}
              >
                {/* 时间轴点 */}
                <div className="mt-1 shrink-0">
                  <div className={[
                    'w-2 h-2 rounded-full',
                    selectedId === snap.id ? 'bg-[#c9940a]' : 'bg-gray-300 dark:bg-neutral-600',
                  ].join(' ')} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-neutral-100 truncate">
                    {snap.message || t('snapshots.noMessage')}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-neutral-500 mt-0.5">
                    {new Date(snap.created_at).toLocaleString(i18n.language)}
                  </p>
                </div>
                {selectedId === snap.id && (
                  <svg className="w-4 h-4 text-[#c9940a] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 恢复操作栏 */}
      {selectedId && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-neutral-800 shrink-0">
          <button
            className="btn btn-primary btn-sm w-full"
            onClick={handleRestore}
            disabled={restoring}
          >
            {restoring ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                {t('snapshots.restoring')}
              </span>
            ) : t('snapshots.restore')}
          </button>
        </div>
      )}

      {/* Diff 视图 */}
      {(diffLoading || diff) && (
        <div className="border-t border-gray-100 dark:border-neutral-800 shrink-0 max-h-60 overflow-y-auto">
          {diffLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-4 h-4 border-2 border-[#c9940a] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : diff ? (
            <DiffView lines={diff} />
          ) : null}
        </div>
      )}
    </div>
  );
}

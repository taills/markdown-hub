import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { attachmentService } from '@/services/api';
import { ErrorModal } from '@/components/ErrorModal';
import type { Attachment } from '@/types';

interface AttachmentPanelProps {
  documentId: string;
  onInsert: (attachment: Attachment) => Promise<void>;
}

// 根据 mime type 返回文件图标 SVG path
function FileIcon({ type }: { type?: string }) {
  const isImage = type?.startsWith('image/');
  const isPdf = type === 'application/pdf';
  if (isImage) {
    return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }
  if (isPdf) {
    return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="11" y2="17" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function AttachmentPanel({ documentId, onInsert }: AttachmentPanelProps) {
  const { t } = useTranslation();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [unreferenced, setUnreferenced] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showUnreferenced, setShowUnreferenced] = useState(false);

  const handleCloseError = () => setError('');

  const load = async () => {
    setIsLoading(true);
    try {
      const atts = await attachmentService.list(documentId);
      setAttachments(atts ?? []);
      const unref = await attachmentService.getUnreferenced(documentId);
      setUnreferenced(unref ?? []);
    } catch (err) {
      console.error('Failed to load attachments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [documentId]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError('');

    try {
      for (let i = 0; i < files.length; i++) {
        await attachmentService.upload(documentId, files[i]);
      }
      await load();
      // input 在 label 内，上传完成后通过重置 event target 清空选择
      (event.target as HTMLInputElement).value = '';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm(t('attachments.deleteConfirm'))) return;
    try {
      await attachmentService.delete(documentId, attachmentId);
      await load();
    } catch (err) {
      console.error('Failed to delete attachment:', err);
    }
  };

  const handleInsert = async (attachment: Attachment) => {
    try {
      await onInsert(attachment);
      await load();
    } catch (err) {
      console.error('Failed to insert attachment:', err);
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    try {
      const blob = await attachmentService.download(attachment.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download attachment:', err);
      setError(t('attachments.downloadFailed'));
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  const unreferencedIds = new Set(unreferenced.map((att) => att.id));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 标题栏 + 上传按钮（用 label 原生触发，避免 .click() 堆积 filechooser） */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-neutral-800 shrink-0">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-neutral-500">
          {t('attachments.title')}
        </span>
        <label
          className={`btn btn-secondary btn-xs flex items-center gap-1.5 cursor-pointer ${uploading ? 'opacity-35 pointer-events-none' : ''}`}
        >
          <input
            type="file"
            multiple
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
          {uploading ? (
            <>
              <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              {t('attachments.uploading')}
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {t('attachments.uploadFiles')}
            </>
          )}
        </label>
      </div>

      {/* 附件列表区域 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-[#c9940a] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-400 dark:text-neutral-500">{t('common.loading')}</span>
            </div>
          </div>
        ) : (
          <>
            {/* 所有附件 */}
            <div>
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-neutral-800/50">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-neutral-500">
                  {t('attachments.allTitle')}
                </span>
                <span className="text-xs text-gray-400 dark:text-neutral-500 font-mono">
                  {attachments.length}
                </span>
              </div>

              {attachments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e5e5e5" strokeWidth="1.5">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <p className="text-sm" style={{ color: 'var(--meta-gray)' }}>{t('attachments.empty')}</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {attachments.map((att) => {
                    const isUnref = unreferencedIds.has(att.id);
                    return (
                      <AttachmentRow
                        key={att.id}
                        attachment={att}
                        isUnreferenced={isUnref}
                        onInsert={handleInsert}
                        onDownload={handleDownload}
                        onDelete={handleDelete}
                        formatFileSize={formatFileSize}
                        t={t}
                      />
                    );
                  })}
                </ul>
              )}
            </div>

            {/* 未引用附件折叠区 */}
            {unreferenced.length > 0 && (
              <div className="border-t border-gray-100 dark:border-neutral-800">
                <button
                  onClick={() => setShowUnreferenced(!showUnreferenced)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-yellow-900/20 hover:bg-amber-100 dark:hover:bg-yellow-900/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg className={`w-3.5 h-3.5 text-amber-500 transition-transform ${showUnreferenced ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-yellow-400">
                      {t('attachments.unreferenced')}
                    </span>
                  </div>
                  <span className="text-xs text-amber-500 dark:text-yellow-400 font-mono">{unreferenced.length}</span>
                </button>
                {showUnreferenced && (
                  <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
                    {unreferenced.map((att) => (
                      <AttachmentRow
                        key={att.id}
                        attachment={att}
                        isUnreferenced
                        onInsert={handleInsert}
                        onDownload={handleDownload}
                        onDelete={handleDelete}
                        formatFileSize={formatFileSize}
                        t={t}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <ErrorModal message={error} onClose={handleCloseError} />
    </div>
  );
}

// 附件行子组件
interface AttachmentRowProps {
  attachment: Attachment;
  isUnreferenced: boolean;
  onInsert: (att: Attachment) => void;
  onDownload: (att: Attachment) => void;
  onDelete: (id: string) => void;
  formatFileSize: (bytes: number) => string;
  t: (key: string) => string;
}

function AttachmentRow({ attachment: att, isUnreferenced, onInsert, onDownload, onDelete, formatFileSize, t }: AttachmentRowProps) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 group hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors">
      {/* 文件图标 */}
      <div className={[
        'w-8 h-8 flex items-center justify-center shrink-0',
        isUnreferenced
          ? 'text-amber-400 dark:text-yellow-500'
          : 'text-gray-400 dark:text-neutral-500',
      ].join(' ')}>
        <FileIcon type={att.file_type} />
      </div>

      {/* 文件信息 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-neutral-100 truncate" title={att.filename}>
          {att.filename}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-400 dark:text-neutral-500 font-mono">
            {formatFileSize(att.file_size)}
          </span>
          {isUnreferenced && (
            <span className="text-xs font-bold px-1.5 py-0 bg-amber-50 text-amber-500 dark:bg-yellow-900/30 dark:text-yellow-400 uppercase tracking-wide">
              {t('attachments.unused')}
            </span>
          )}
        </div>
      </div>

      {/* 操作按钮组 */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {/* 插入 */}
        <button
          onClick={() => onInsert(att)}
          className="p-1.5 text-gray-400 hover:text-[#c9940a] dark:text-neutral-500 dark:hover:text-yellow-400 transition-colors"
          title={t('attachments.insert')}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        {/* 下载 */}
        <button
          onClick={() => onDownload(att)}
          className="p-1.5 text-gray-400 hover:text-blue-500 dark:text-neutral-500 dark:hover:text-blue-400 transition-colors"
          title={t('attachments.download')}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        {/* 删除 */}
        <button
          onClick={() => onDelete(att.id)}
          className="p-1.5 text-gray-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400 transition-colors"
          title={t('attachments.delete')}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </li>
  );
}

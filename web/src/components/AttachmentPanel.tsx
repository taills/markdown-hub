import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { attachmentService, workspaceAttachmentService } from '@/services/api';
import type { Attachment } from '@/types';

interface AttachmentPanelProps {
  documentId: string;
  workspaceId: string;
  onInsert: (attachment: Attachment) => Promise<void>;
}

export function AttachmentPanel({ documentId, workspaceId, onInsert }: AttachmentPanelProps) {
  const { t } = useTranslation();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [workspaceAttachments, setWorkspaceAttachments] = useState<Attachment[]>([]);
  const [unreferenced, setUnreferenced] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showUnreferenced, setShowUnreferenced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const atts = await attachmentService.list(documentId);
      setAttachments(atts ?? []);
      const unref = await attachmentService.getUnreferenced(documentId);
      setUnreferenced(unref ?? []);
      const wsAtts = await workspaceAttachmentService.list(workspaceId);
      setWorkspaceAttachments(wsAtts ?? []);
    } catch (err) {
      console.error('Failed to load attachments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [documentId, workspaceId]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    if (!files) return;

    setUploading(true);
    setError('');

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await attachmentService.upload(documentId, file);
      }
      await load();
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
      alert(t('attachments.downloadFailed'));
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const unreferencedIds = new Set(unreferenced.map((att) => att.id));

  return (
    <div className="attachment-panel">
      <h3>{t('attachments.title')}</h3>

      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <>
          <div className="attachment-list workspace-attachment-list">
            <h4>{t('attachments.workspaceTitle')} ({workspaceAttachments.length})</h4>
            {workspaceAttachments.length === 0 ? (
              <p className="empty">{t('attachments.emptyWorkspace')}</p>
            ) : (
              <table className="attachment-table">
                <thead>
                  <tr>
                    <th>{t('attachments.file')}</th>
                    <th>{t('attachments.size')}</th>
                    <th className="att-actions-header">{t('attachments.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {workspaceAttachments.map((att) => (
                    <tr key={att.id}>
                      <td className="att-name-cell">{att.filename}</td>
                      <td className="att-size-cell">{formatFileSize(att.file_size)}</td>
                      <td className="att-actions-cell">
                        <div className="att-actions">
                          <button
                            onClick={() => handleInsert(att)}
                            className="att-insert"
                          >
                            {t('attachments.insert')}
                          </button>
                          <button
                            onClick={() => handleDownload(att)}
                            className="att-download"
                          >
                            {t('attachments.download')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="upload-section">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              disabled={uploading}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="upload-button"
            >
              {uploading ? t('attachments.uploading') : t('attachments.uploadFiles')}
            </button>
            {error && <p className="error">{error}</p>}
          </div>

          <div className="attachment-list">
            <h4>{t('attachments.allTitle')} ({attachments.length})</h4>
            {attachments.length === 0 ? (
              <p className="empty">{t('attachments.empty')}</p>
            ) : (
              <table className="attachment-table">
                <thead>
                  <tr>
                    <th>{t('attachments.file')}</th>
                    <th>{t('attachments.size')}</th>
                    <th>{t('attachments.status')}</th>
                    <th className="att-actions-header">{t('attachments.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {attachments.map((att) => {
                    const isUnreferenced = unreferencedIds.has(att.id);
                    return (
                      <tr key={att.id} className={isUnreferenced ? 'unreferenced' : undefined}>
                        <td className="att-name-cell">{att.filename}</td>
                        <td className="att-size-cell">{formatFileSize(att.file_size)}</td>
                        <td className="att-status-cell">
                          <span className={`att-badge ${isUnreferenced ? 'att-badge-unused' : 'att-badge-used'}`}>
                            {isUnreferenced ? t('attachments.unused') : t('attachments.inUse')}
                          </span>
                        </td>
                        <td className="att-actions-cell">
                          <div className="att-actions">
                            <button
                              onClick={() => handleInsert(att)}
                              className="att-insert"
                            >
                              {t('attachments.insert')}
                            </button>
                            <button
                              onClick={() => handleDownload(att)}
                              className="att-download"
                            >
                              {t('attachments.download')}
                            </button>
                            <button
                              onClick={() => handleDelete(att.id)}
                              className="att-delete"
                            >
                              {t('attachments.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {unreferenced.length > 0 && (
            <div className="unreferenced-section">
              <button
                onClick={() => setShowUnreferenced(!showUnreferenced)}
                className="toggle-button"
              >
                {showUnreferenced ? '▼' : '▶'} {t('attachments.unreferenced')} ({unreferenced.length})
              </button>
              {showUnreferenced && (
                <table className="attachment-table">
                  <thead>
                    <tr>
                      <th>{t('attachments.file')}</th>
                      <th>{t('attachments.size')}</th>
                      <th>{t('attachments.status')}</th>
                      <th className="att-actions-header">{t('attachments.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unreferenced.map((att) => (
                      <tr key={att.id} className="unreferenced">
                        <td className="att-name-cell">{att.filename}</td>
                        <td className="att-size-cell">{formatFileSize(att.file_size)}</td>
                        <td className="att-status-cell">
                          <span className="att-badge att-badge-unused">{t('attachments.unused')}</span>
                        </td>
                        <td className="att-actions-cell">
                          <div className="att-actions">
                            <button
                              onClick={() => handleInsert(att)}
                              className="att-insert"
                            >
                              {t('attachments.insert')}
                            </button>
                            <button
                              onClick={() => handleDownload(att)}
                              className="att-download"
                            >
                              {t('attachments.download')}
                            </button>
                            <button
                              onClick={() => handleDelete(att.id)}
                              className="att-delete"
                            >
                              {t('attachments.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

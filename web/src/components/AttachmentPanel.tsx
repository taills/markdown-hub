import { useState, useEffect, useRef } from 'react';
import { attachmentService } from '@/services/api';
import type { Attachment } from '@/types';

interface AttachmentPanelProps {
  documentId: string;
  onInsert: (attachment: Attachment) => Promise<void>;
}

export function AttachmentPanel({ documentId, onInsert }: AttachmentPanelProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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
    if (!confirm('Delete this attachment?')) return;
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
      alert('Failed to download attachment');
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
      <h3>Attachments</h3>

      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <>
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
              {uploading ? 'Uploading…' : 'Upload Files'}
            </button>
            {error && <p className="error">{error}</p>}
          </div>

          <div className="attachment-list">
            <h4>All Attachments ({attachments.length})</h4>
            {attachments.length === 0 ? (
              <p className="empty">No attachments yet.</p>
            ) : (
              <table className="attachment-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th className="att-actions-header">Actions</th>
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
                            {isUnreferenced ? 'Unused' : 'In use'}
                          </span>
                        </td>
                        <td className="att-actions-cell">
                          <div className="att-actions">
                            <button
                              onClick={() => handleInsert(att)}
                              className="att-insert"
                            >
                              Insert
                            </button>
                            <button
                              onClick={() => handleDownload(att)}
                              className="att-download"
                            >
                              Download
                            </button>
                            <button
                              onClick={() => handleDelete(att.id)}
                              className="att-delete"
                            >
                              Delete
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
                {showUnreferenced ? '▼' : '▶'} Unreferenced Attachments ({unreferenced.length})
              </button>
              {showUnreferenced && (
                <table className="attachment-table">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Size</th>
                      <th>Status</th>
                      <th className="att-actions-header">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unreferenced.map((att) => (
                      <tr key={att.id} className="unreferenced">
                        <td className="att-name-cell">{att.filename}</td>
                        <td className="att-size-cell">{formatFileSize(att.file_size)}</td>
                        <td className="att-status-cell">
                          <span className="att-badge att-badge-unused">Unused</span>
                        </td>
                        <td className="att-actions-cell">
                          <div className="att-actions">
                            <button
                              onClick={() => handleInsert(att)}
                              className="att-insert"
                            >
                              Insert
                            </button>
                            <button
                              onClick={() => handleDownload(att)}
                              className="att-download"
                            >
                              Download
                            </button>
                            <button
                              onClick={() => handleDelete(att.id)}
                              className="att-delete"
                            >
                              Delete
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

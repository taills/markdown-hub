import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface ErrorModalProps {
  message: string;
  onClose: () => void;
  title?: string;
}

export function ErrorModal({ message, onClose, title }: ErrorModalProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!message) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [message, onClose]);

  useEffect(() => {
    if (message && panelRef.current) {
      panelRef.current.focus();
    }
  }, [message]);

  if (!message) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title ?? t('common.error')}
        tabIndex={-1}
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{title ?? t('common.error')}</h3>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

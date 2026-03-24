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
    <div
      className="hs-overlay open size-full fixed top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 opacity-0 ease-out transition-all sm:max-w-lg sm:w-full m-3 sm:mx-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex flex-col bg-white border shadow-sm rounded-xl dark:bg-neutral-800 dark:border-neutral-700"
          role="dialog"
          aria-modal="true"
          aria-label={title ?? t('common.error')}
          tabIndex={-1}
          ref={panelRef}
        >
          {/* Header */}
          <div className="flex items-center justify-between py-3 px-4 border-b border-gray-200 dark:border-neutral-700">
            <div className="flex items-center gap-2">
              <svg className="size-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <h3 className="font-semibold text-gray-800 dark:text-neutral-200">
                {title ?? t('common.error')}
              </h3>
            </div>
            <button
              className="size-8 inline-flex justify-center items-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-600"
              onClick={onClose}
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-4 py-4">
            <p className="text-sm text-gray-700 dark:text-neutral-300">{message}</p>
          </div>

          {/* Footer */}
          <div className="flex justify-end items-center gap-x-2 py-3 px-4 border-t border-gray-200 dark:border-neutral-700">
            <button
              className="py-2 px-4 inline-flex items-center gap-x-2 text-sm font-medium rounded-lg border border-transparent bg-blue-600 text-white hover:bg-blue-700"
              onClick={onClose}
            >
              {t('common.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

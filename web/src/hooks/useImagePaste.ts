import { useCallback, useRef } from 'react';

interface PasteImageHandlerOptions {
  onImagePaste?: (data: { file: File; dataUrl: string }) => void;
  onError?: (error: string) => void;
}

export function useImagePaste(options: PasteImageHandlerOptions = {}) {
  const elementRef = useRef<HTMLElement | null>(null);

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Check if item is an image
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();
          if (!file) continue;

          // Create a data URL for preview
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            options.onImagePaste?.({ file, dataUrl });
          };
          reader.onerror = () => {
            options.onError?.('Failed to read image file');
          };
          reader.readAsDataURL(file);
        }
      }
    },
    [options]
  );

  const attachPasteListener = useCallback(
    (element: HTMLElement) => {
      elementRef.current = element;
      element.addEventListener('paste', handlePaste as EventListener);

      return () => {
        element.removeEventListener('paste', handlePaste as EventListener);
      };
    },
    [handlePaste]
  );

  return { attachPasteListener, elementRef };
}

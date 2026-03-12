import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { siteService } from '@/services/api';

interface SiteTitleContextType {
  siteTitle: string;
  isLoading: boolean;
}

const SiteTitleContext = createContext<SiteTitleContextType>({
  siteTitle: 'MarkdownHub',
  isLoading: true,
});

export function SiteTitleProvider({ children }: { children: ReactNode }) {
  const [siteTitle, setSiteTitle] = useState('MarkdownHub');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    siteService.getSiteTitle()
      .then((title) => {
        setSiteTitle(title);
        // Update document title
        if (typeof document !== 'undefined') {
          document.title = title;
        }
      })
      .catch(() => {
        // Keep default if fetch fails
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <SiteTitleContext.Provider value={{ siteTitle, isLoading }}>
      {children}
    </SiteTitleContext.Provider>
  );
}

export function useSiteTitle() {
  return useContext(SiteTitleContext);
}

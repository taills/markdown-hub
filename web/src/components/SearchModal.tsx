import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { documentService } from '@/services/api';
import type { DocumentSearchResult } from '@/types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocumentSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Search with debounce
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const data = await documentService.search(query);
        setResults(data ?? []);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Search failed:', err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter' && results[selectedIndex]) {
      event.preventDefault();
      const doc = results[selectedIndex];
      navigate(`/documents/${doc.id}`);
      onClose();
    }
  }, [results, selectedIndex, navigate, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, results.length]);

  // Get excerpt from content
  const getExcerpt = (content: string, query: string): string => {
    const index = content.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) {
      return content.substring(0, 100) + (content.length > 100 ? '...' : '');
    }
    const start = Math.max(0, index - 30);
    const end = Math.min(content.length, index + query.length + 70);
    let excerpt = content.substring(start, end);
    if (start > 0) excerpt = '...' + excerpt;
    if (end < content.length) excerpt = excerpt + '...';
    return excerpt;
  };

  if (!isOpen) return null;

  return (
    <div
      className="search-modal-overlay"
      onClick={onClose}
    >
      <div
        className="search-modal-container"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col bg-white border shadow-sm dark:bg-neutral-800 dark:border-neutral-700">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-neutral-700">
            <svg className="shrink-0 size-4 text-gray-500 dark:text-neutral-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="grow text-sm text-gray-800 dark:text-neutral-200 bg-transparent border-0 outline-none placeholder-gray-400 dark:placeholder-neutral-500"
              placeholder={t('search.placeholder', '搜索文档标题或内容...')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {isLoading && (
              <svg className="shrink-0 size-4 animate-spin text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <button
              className="shrink-0 size-7 inline-flex justify-center items-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-600"
              onClick={onClose}
              aria-label={t('common.close', '关闭')}
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Results */}
          {query.trim() && results.length > 0 && (
            <div
              className="max-h-80 overflow-y-auto"
              ref={resultsRef}
            >
              {results.map((doc, index) => (
                <div
                  key={doc.id}
                  className={`px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-neutral-700 ${
                    index === selectedIndex
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-neutral-700'
                  }`}
                  onClick={() => {
                    navigate(`/documents/${doc.id}`);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-neutral-200 truncate">
                      {doc.title || t('home.untitled', '无标题文档')}
                    </span>
                    {doc.workspace_name && (
                      <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-neutral-700 dark:text-neutral-400">
                        {doc.workspace_name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-neutral-400 mt-0.5 line-clamp-2">
                    {getExcerpt(doc.content, query)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {query.trim() && !isLoading && results.length === 0 && (
            <div className="px-4 py-8 text-sm text-center text-gray-500 dark:text-neutral-400">
              {t('search.noResults', '未找到相关文档')}
            </div>
          )}

          {!query.trim() && (
            <div className="px-4 py-6 text-sm text-center text-gray-400 dark:text-neutral-500">
              {t('search.hint', '输入关键词搜索文档')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

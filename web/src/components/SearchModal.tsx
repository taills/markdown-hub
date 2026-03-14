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
    <div className="modal-backdrop search-modal-backdrop" onClick={onClose}>
      <div
        className="search-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title', '搜索文档')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="search-input-wrapper">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder={t('search.placeholder', '搜索文档标题或内容...')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {isLoading && <div className="search-loading" />}
          <button className="search-close-btn" onClick={onClose} aria-label={t('common.close', '关闭')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {query.trim() && results.length > 0 && (
          <div className="search-results" ref={resultsRef}>
            {results.map((doc, index) => (
              <div
                key={doc.id}
                className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => {
                  navigate(`/documents/${doc.id}`);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="search-result-title">
                  {doc.title || t('home.untitled', '无标题文档')}
                  {doc.workspace_name && (
                    <span className="search-result-workspace">{doc.workspace_name}</span>
                  )}
                </div>
                <div className="search-result-excerpt">
                  {getExcerpt(doc.content, query)}
                </div>
              </div>
            ))}
          </div>
        )}

        {query.trim() && !isLoading && results.length === 0 && (
          <div className="search-empty">
            {t('search.noResults', '未找到相关文档')}
          </div>
        )}

        {!query.trim() && (
          <div className="search-hint">
            {t('search.hint', '输入关键词搜索文档')}
          </div>
        )}
      </div>
    </div>
  );
}

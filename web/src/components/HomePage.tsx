import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { homeService, siteService, documentService } from '@/services/api';
import type { Document, DocumentSearchResult } from '@/types';

interface HomeData {
  documents: Document[];
}

/**
 * HomePage — 博客风格首页,展示公开工作空间和文档
 * 未登录用户可访问
 */
export function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<HomeData | null>(null);
  const [siteTitle, setSiteTitle] = useState<string>('MarkdownHub');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DocumentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut to focus search
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      searchInputRef.current?.focus();
    }
  }, []);

  // 搜索防抖
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await documentService.search(searchQuery);
        setSearchResults(results ?? []);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Search failed:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 搜索结果键盘导航
  const handleSearchKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter' && searchResults[selectedIndex]) {
      event.preventDefault();
      navigate(`/documents/${searchResults[selectedIndex].id}`);
    } else if (event.key === 'Escape') {
      setSearchQuery('');
      searchInputRef.current?.blur();
    }
  }, [searchResults, selectedIndex, navigate]);

  // 滚动选中的搜索结果到视图
  useEffect(() => {
    if (searchResultsRef.current && searchResults.length > 0) {
      const selectedElement = searchResultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, searchResults.length]);

  // 获取搜索结果摘要
  const getSearchExcerpt = (content: string, query: string): string => {
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

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    // 并行获取站点标题和首页数据
    Promise.all([
      homeService.getData(),
      siteService.getSiteTitle().catch(() => 'MarkdownHub'),
    ])
      .then(([homeData, title]) => {
        setData(homeData);
        setSiteTitle(title);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  // 提取文档内容前N个字符作为摘要
  const getExcerpt = (content: string, maxLength: number = 200): string => {
    if (!content) return '';
    const stripped = content.replace(/[#*`\[\]()]/g, '').trim();
    return stripped.length > maxLength
      ? stripped.substring(0, maxLength) + '...'
      : stripped;
  };

  if (isLoading) {
    return (
      <div className="blog-home">
        <div className="blog-loading">{t('common.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="blog-home">
        <div className="blog-error">{error}</div>
      </div>
    );
  }

  const hasPublicContent = (data?.documents.length ?? 0) > 0;

  return (
    <div className="blog-home">
      {/* Hero 区域 */}
      <header className="blog-hero flex justify-center">
        <div className="max-w-3xl text-center">
          <h1 className="blog-hero-title">{siteTitle}</h1>
          <p className="blog-hero-subtitle">
            {t('home.subtitle', '知识分享 · 协作写作 · Markdown创作平台')}
          </p>
          <div className="search-wrapper">
            <div className="search-input-container">
              <svg className="search-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                className="search-input"
                placeholder={t('search.placeholder', '搜索文档...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              {isSearching && (
                <svg className="absolute right-24 top-1/2 -translate-y-1/2 size-4 animate-spin text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              <span className="search-kbd">⌘K</span>

              {/* 搜索结果 */}
              {searchQuery.trim() && (
                <div className="search-results-dropdown" ref={searchResultsRef}>
                  {searchResults.length > 0 ? (
                    searchResults.map((doc, index) => (
                      <div
                        key={doc.id}
                        className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
                        onClick={() => navigate(`/documents/${doc.id}`)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-200 truncate">
                            {doc.title || t('home.untitled', '无标题文档')}
                          </span>
                          {doc.workspace_name && (
                            <span className="search-result-tag">
                              {doc.workspace_name}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                          {getSearchExcerpt(doc.content, searchQuery)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-sm text-center text-slate-500 dark:text-slate-400">
                      {t('search.noResults', '未找到相关文档')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <nav className="blog-hero-nav">
            {user ? (
              <button
                className="btn btn-primary btn-lg"
                onClick={() => navigate('/documents')}
              >
                {t('nav.editor', '进入编辑器')}
              </button>
            ) : (
              <>
                <Link to="/login" className="btn btn-secondary btn-lg">
                  {t('home.login', '登录')}
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* 主体内容区 */}
      <main className="blog-container">
        {!hasPublicContent ? (
          <div className="homepage-empty">
            <svg
              className="homepage-empty-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <p className="homepage-empty-title">{t('home.noPublicContent', '暂无公开内容')}</p>
            <p className="homepage-empty-hint">
              {t('home.noPublicContentHint', '管理员可以在工作空间或文档中设置为公开,内容将展示在此处')}
            </p>
          </div>
        ) : (
          <>
            {/* 公开文章列表 */}
            {data?.documents && data.documents.length > 0 && (
              <section className="blog-section">
                <div className="blog-section-header">
                  <h2 className="blog-section-title">
                    {t('home.recentPosts', '最新文章')}
                  </h2>
                  <p className="blog-section-description">
                    {t('home.latestUpdates', '查看最近更新的公开文档')}
                  </p>
                </div>

                <div className="blog-grid">
                  {data.documents.map((doc) => (
                    <article key={doc.id} className="blog-card">
                      <Link to={`/documents/${doc.id}/view`} className="blog-card-link-wrapper">
                        <h3 className="blog-card-title">
                          {doc.title || t('home.untitled', '无标题文档')}
                        </h3>

                        <div className="blog-card-meta">
                          <time>
                            {new Date(doc.updated_at).toLocaleDateString('zh-CN', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </time>
                          <span>·</span>
                          <span>
                            {t('home.readTime', '{{min}} 分钟阅读', {
                              min: Math.max(1, Math.ceil(doc.content.length / 400)),
                            })}
                          </span>
                        </div>

                        {doc.content && (
                          <p className="blog-card-excerpt">{getExcerpt(doc.content)}</p>
                        )}

                        <span className="blog-card-cta">
                          {t('home.readMore', '阅读全文')}
                          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      </Link>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

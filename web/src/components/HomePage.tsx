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
      <header className="blog-hero">
        <div className="blog-hero-content">
          <h1 className="blog-hero-title">{siteTitle}</h1>
          <p className="blog-hero-subtitle">
            {t('home.subtitle', '知识分享 · 协作写作 · Markdown创作平台')}
          </p>
          <div className="blog-search-container">
            <div className="blog-search">
              <svg className="blog-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                className="blog-search-input"
                placeholder={t('search.placeholder', '搜索文档...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              {isSearching && <div className="search-loading-small" />}
              <span className="blog-search-shortcut">⌘K</span>
            </div>

            {/* 搜索结果 */}
            {searchQuery.trim() && (
              <div className="blog-search-results" ref={searchResultsRef}>
                {searchResults.length > 0 ? (
                  searchResults.map((doc, index) => (
                    <div
                      key={doc.id}
                      className={`blog-search-result-item ${index === selectedIndex ? 'selected' : ''}`}
                      onClick={() => navigate(`/documents/${doc.id}`)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="blog-search-result-title">
                        {doc.title || t('home.untitled', '无标题文档')}
                        {doc.workspace_name && (
                          <span className="blog-search-result-workspace">{doc.workspace_name}</span>
                        )}
                      </div>
                      <div className="blog-search-result-excerpt">
                        {getSearchExcerpt(doc.content, searchQuery)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="blog-search-empty">
                    {t('search.noResults', '未找到相关文档')}
                  </div>
                )}
              </div>
            )}
          </div>
          <nav className="blog-nav">
            {user ? (
              <button
                className="blog-nav-btn blog-nav-btn-primary"
                onClick={() => navigate('/documents')}
              >
                {t('nav.editor', '进入编辑器')}
              </button>
            ) : (
              <>
                <Link to="/login" className="blog-nav-btn blog-nav-btn-outline">
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
          <div className="blog-empty">
            <svg
              className="blog-empty-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="blog-empty-text">{t('home.noPublicContent', '暂无公开内容')}</p>
            <p className="blog-empty-hint">
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
                  <p className="blog-section-subtitle">
                    {t('home.latestUpdates', '查看最近更新的公开文档')}
                  </p>
                </div>

                <div className="blog-posts">
                  {data.documents.map((doc) => (
                    <article key={doc.id} className="blog-post-card">
                      <Link to={`/documents/${doc.id}/view`} className="blog-post-link">
                        <h3 className="blog-post-title">
                          {doc.title || t('home.untitled', '无标题文档')}
                        </h3>
                      </Link>

                      <div className="blog-post-meta">
                        <time className="blog-post-date">
                          {new Date(doc.updated_at).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </time>
                        <span className="blog-post-separator">·</span>
                        <span className="blog-post-read-time">
                          {t('home.readTime', '{{min}} 分钟阅读', {
                            min: Math.max(1, Math.ceil(doc.content.length / 400)),
                          })}
                        </span>
                      </div>

                      {doc.content && (
                        <p className="blog-post-excerpt">{getExcerpt(doc.content)}</p>
                      )}

                      <Link
                        to={`/documents/${doc.id}/view`}
                        className="blog-post-read-more"
                      >
                        {t('home.readMore', '阅读全文')}
                        <svg className="blog-post-arrow" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
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

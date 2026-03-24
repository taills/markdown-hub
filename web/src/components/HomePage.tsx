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
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-900">
      {/* Hero 区域 */}
      <header className="py-16 px-6 text-center bg-white dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">{siteTitle}</h1>
          <p className="text-base text-gray-500 dark:text-neutral-400">
            {t('home.subtitle', '知识分享 · 协作写作 · Markdown创作平台')}
          </p>
          <div className="flex justify-center mb-8">
            <div className="relative w-full max-w-lg">
              <div className="flex items-center w-full">
                <svg className="absolute left-3 size-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="w-full py-2.5 ps-10 pe-16 text-sm border border-gray-200 dark:border-neutral-700 rounded-full bg-white dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 placeholder-gray-400 dark:placeholder-neutral-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  placeholder={t('search.placeholder', '搜索文档...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
                {isSearching && (
                  <svg className="absolute right-10 size-4 animate-spin text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                <span className="absolute right-3 px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-neutral-700 text-gray-400 dark:text-neutral-500 font-mono pointer-events-none">⌘K</span>
              </div>

              {/* 搜索结果 */}
              {searchQuery.trim() && (
                <div className="absolute top-full mt-2 w-full bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl shadow-lg overflow-hidden z-10" ref={searchResultsRef}>
                  {searchResults.length > 0 ? (
                    searchResults.map((doc, index) => (
                      <div
                        key={doc.id}
                        className={`px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-neutral-700 last:border-0 ${
                          index === selectedIndex
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-neutral-700'
                        }`}
                        onClick={() => navigate(`/documents/${doc.id}`)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-gray-900 dark:text-neutral-200 truncate">
                            {doc.title || t('home.untitled', '无标题文档')}
                          </span>
                          {doc.workspace_name && (
                            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-700 text-gray-500 dark:text-neutral-400">
                              {doc.workspace_name}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-neutral-400 line-clamp-2">
                          {getSearchExcerpt(doc.content, searchQuery)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-sm text-center text-gray-500 dark:text-neutral-400">
                      {t('search.noResults', '未找到相关文档')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <nav className="flex justify-center gap-3 mt-6">
            {user ? (
              <button
                className="px-5 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => navigate('/documents')}
              >
                {t('nav.editor', '进入编辑器')}
              </button>
            ) : (
              <>
                <Link to="/login" className="px-5 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-700">
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
              <section className="mt-12 px-6 max-w-5xl mx-auto">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {t('home.recentPosts', '最新文章')}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">
                    {t('home.latestUpdates', '查看最近更新的公开文档')}
                  </p>
                </div>

                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {data.documents.map((doc) => (
                    <article key={doc.id} className="flex flex-col gap-2 p-5 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl hover:shadow-md transition-shadow">
                      <Link to={`/documents/${doc.id}/view`} className="group">
                        <h3 className="text-base font-medium text-gray-900 dark:text-neutral-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {doc.title || t('home.untitled', '无标题文档')}
                        </h3>
                      </Link>

                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
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
                        <p className="text-sm text-gray-600 dark:text-neutral-400 line-clamp-3">{getExcerpt(doc.content)}</p>
                      )}

                      <Link
                        to={`/documents/${doc.id}/view`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline mt-auto"
                      >
                        {t('home.readMore', '阅读全文')}
                        <svg className="size-3" viewBox="0 0 20 20" fill="currentColor">
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

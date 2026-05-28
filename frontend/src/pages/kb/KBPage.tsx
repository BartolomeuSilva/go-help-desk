import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { listKBCategories, listKBArticlesByCategory, searchKBArticles } from '@/api/kb'
import { Layout } from '@/components/Layout'
import { useAuthStore } from '@/store/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { FolderIcon, FileTextIcon, SearchIcon, BookOpenIcon, SettingsIcon, EyeIcon } from 'lucide-react'
import type { KBArticle } from '@/api/types'
import { useT } from '@/i18n'

export function KBPage() {
  const { t } = useT()
  const { user } = useAuthStore()
  const isStaffOrAdmin = user?.role === 'admin' || user?.role === 'staff'
  const [searchQuery, setSearchQuery] = useState('')

  // 1. Fetch categories
  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: ['kb', 'categories', isStaffOrAdmin],
    queryFn: () => listKBCategories(),
  })

  // 2. Fetch all articles sequentially by querying per active category to get detailed visibility
  // Fetch articles across categories to build search / flat list
  const { data: articlesMap = {}, isLoading: loadingArticles } = useQuery({
    queryKey: ['kb', 'articles-map', categories.map((c) => c.id), isStaffOrAdmin],
    queryFn: async () => {
      const map: Record<string, KBArticle[]> = {}
      for (const cat of categories) {
        try {
          map[cat.id] = await listKBArticlesByCategory(cat.id)
        } catch {
          map[cat.id] = []
        }
      }
      return map
    },
    enabled: categories.length > 0,
  })

  const hasSearch = searchQuery.trim().length > 0

  // 3. Search articles using FTS on backend
  const { data: searchResults = [], isLoading: searching } = useQuery({
    queryKey: ['kb', 'search', searchQuery, isStaffOrAdmin],
    queryFn: () => searchKBArticles(searchQuery.trim()),
    enabled: hasSearch,
  })

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-[#2a2a2a] pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BookOpenIcon className="h-6 w-6 text-blue-600 dark:text-[#faff69]" />
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white font-sans">
                {t('kb.title')}
              </h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('kb.subtitle')}
            </p>
          </div>
          {user?.role === 'admin' && (
            <Link to="/admin/kb">
              <Button className="shrink-0">
                <SettingsIcon className="mr-2 h-4 w-4" />
                {t('kb.manage')}
              </Button>
            </Link>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative max-w-xl mx-auto">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <SearchIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          </div>
          <Input
            type="text"
            placeholder={t('kb.search_placeholder')}
            className="pl-10 h-12 bg-white dark:bg-[#1a1a1a] border-gray-300 dark:border-[#2a2a2a] text-gray-900 dark:text-white rounded-lg shadow-sm focus:ring-blue-500 dark:focus:ring-[#faff69]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {loadingCats || (loadingArticles && categories.length > 0 && !hasSearch) || (hasSearch && searching) ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Search results view */}
            {hasSearch ? (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {t('kb.search_results')} ({searchResults.length})
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {searchResults.map((art) => {
                    const catName = categories.find((c) => c.id === art.category_id)?.name ?? 'Categoria'
                    return (
                      <Link
                        key={art.id}
                        to="/kb/articles/$id"
                        params={{ id: art.id }}
                        className="block p-5 bg-white dark:bg-[#1a1a1a] hover:bg-gray-50/50 dark:hover:bg-[#121212]/50 border border-gray-200 dark:border-[#2a2a2a] rounded-lg transition-colors shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-[#faff69] transition-colors">
                            {art.title}
                          </h3>
                          {art.status === 'draft' && (
                            <Badge variant="secondary" className="shrink-0">
                              {t('kb.badge_draft')}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                          {art.content.replace(/[#*`-]/g, '')}
                        </p>
                        <div className="mt-4 flex items-center justify-between text-[11px] text-gray-400">
                          <span>{t('kb.folder_prefix')} {catName}</span>
                          <span className="flex items-center gap-1">
                            <EyeIcon className="h-3 w-3" /> {art.views} {t('kb.views_suffix')}
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                  {searchResults.length === 0 && (
                    <div className="col-span-2 py-12 text-center text-gray-400">
                      {t('kb.no_articles_found')} "{searchQuery}".
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Categories list view */
              <div className="grid gap-6 md:grid-cols-2">
                {categories.map((cat) => {
                  const catArticles = articlesMap[cat.id] ?? []
                  if (catArticles.length === 0 && !isStaffOrAdmin) return null // Hide empty categories for public

                  return (
                    <div
                      key={cat.id}
                      className="p-6 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] rounded-lg shadow-sm space-y-4"
                    >
                      <div className="flex items-start justify-between border-b border-gray-100 dark:border-[#2a2a2a] pb-3">
                        <div className="flex items-center gap-2">
                          <FolderIcon className="h-5 w-5 text-blue-500 dark:text-[#faff69]" />
                          <h2 className="font-bold text-lg text-gray-900 dark:text-white">
                            {cat.name}
                          </h2>
                        </div>
                        <div className="flex gap-1">
                          {!cat.is_public && (
                            <Badge variant="outline" className="text-[10px] border-red-200 dark:border-red-950/50 text-red-600 bg-red-50 dark:bg-red-950/20">
                              {t('kb.badge_private')}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {cat.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                          {cat.description}
                        </p>
                      )}

                      <ul className="space-y-2">
                        {catArticles.slice(0, 5).map((art) => (
                          <li key={art.id} className="flex items-center justify-between text-sm gap-2">
                            <Link
                              to="/kb/articles/$id"
                              params={{ id: art.id }}
                              className="flex items-center gap-2 text-gray-700 dark:text-white hover:text-blue-600 dark:hover:text-[#faff69] transition-colors truncate"
                            >
                              <FileTextIcon className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
                              <span className="truncate">{art.title}</span>
                            </Link>
                            {art.status === 'draft' && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 scale-90">
                                {t('kb.badge_draft')}
                              </Badge>
                            )}
                          </li>
                        ))}
                        {catArticles.length === 0 && (
                          <li className="text-xs text-gray-400 py-2">
                            {t('kb.empty_category')}
                          </li>
                        )}
                        {catArticles.length > 5 && (
                          <li className="text-xs text-blue-600 dark:text-[#faff69] font-medium pt-2">
                            + {catArticles.length - 5} {t('kb.more_articles')}
                          </li>
                        )}
                      </ul>
                    </div>
                  )
                })}
                {categories.length === 0 && (
                  <div className="col-span-2 py-12 text-center text-gray-400">
                    {t('kb.no_categories')}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}

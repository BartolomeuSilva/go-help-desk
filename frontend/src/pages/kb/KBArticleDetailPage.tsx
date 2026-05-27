import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { getKBArticle, listKBCategories } from '@/api/kb'
import { Layout } from '@/components/Layout'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { ArrowLeftIcon, PencilIcon, CalendarIcon, EyeIcon, FolderIcon } from 'lucide-react'

export function KBArticleDetailPage() {
  const { id } = useParams({ from: '/kb/articles/$id' })
  const { user } = useAuthStore()
  const isStaffOrAdmin = user?.role === 'admin' || user?.role === 'staff'

  // 1. Fetch Article (views count auto-increments if isStaffOrAdmin is false, handled by server)
  const { data: article, isLoading, error } = useQuery({
    queryKey: ['kb', 'article', id, isStaffOrAdmin],
    queryFn: () => getKBArticle(id),
  })

  // 2. Fetch categories to display parent name
  const { data: categories = [] } = useQuery({
    queryKey: ['kb', 'categories', isStaffOrAdmin],
    queryFn: () => listKBCategories(),
  })

  const catName = categories.find((c) => c.id === article?.category_id)?.name ?? 'Categoria'

  // Inline Markdown parser/renderer
  function parseInline(text: string) {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g)
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} className="font-semibold text-gray-900 dark:text-white">
            {part.slice(2, -2)}
          </strong>
        )
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-[#1a1a1a] text-xs font-mono border border-gray-200 dark:border-[#2a2a2a] text-[#eb5757] dark:text-[#faff69]"
          >
            {part.slice(1, -1)}
          </code>
        )
      }
      return part
    })
  }

  function renderMarkdown(content: string) {
    const lines = content.split('\n')
    let inCodeBlock = false
    let codeBlockLines: string[] = []

    return lines
      .map((line, idx) => {
        if (line.startsWith('```')) {
          if (inCodeBlock) {
            inCodeBlock = false
            const code = codeBlockLines.join('\n')
            codeBlockLines = []
            return (
              <pre
                key={idx}
                className="bg-gray-900 border border-gray-800 dark:border-[#2a2a2a] p-4 rounded-md overflow-auto text-xs font-mono text-gray-200 my-4 max-w-full"
              >
                <code>{code}</code>
              </pre>
            )
          } else {
            inCodeBlock = true
            return null
          }
        }

        if (inCodeBlock) {
          codeBlockLines.push(line)
          return null
        }

        if (line.startsWith('### ')) {
          return (
            <h3 key={idx} className="text-base font-bold text-gray-900 dark:text-white mt-6 mb-2">
              {line.slice(4)}
            </h3>
          )
        }
        if (line.startsWith('## ')) {
          return (
            <h2 key={idx} className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-3">
              {line.slice(3)}
            </h2>
          )
        }
        if (line.startsWith('# ')) {
          return (
            <h1 key={idx} className="text-2xl font-extrabold text-gray-900 dark:text-white mt-10 mb-4">
              {line.slice(2)}
            </h1>
          )
        }

        if (line.startsWith('- ')) {
          return (
            <li key={idx} className="list-disc ml-5 text-gray-700 dark:text-gray-300 my-1">
              {parseInline(line.slice(2))}
            </li>
          )
        }

        if (line.trim() === '') {
          return <div key={idx} className="h-2" />
        }

        return (
          <p key={idx} className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 my-2">
            {parseInline(line)}
          </p>
        )
      })
      .filter(Boolean)
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      </Layout>
    )
  }

  if (error || !article) {
    return (
      <Layout>
        <div className="py-12 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Artigo não encontrado</h1>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            O artigo solicitado não existe ou você não tem permissão para visualizá-lo.
          </p>
          <Link to="/kb" className="mt-6 inline-block">
            <Button>Voltar à Base de Conhecimento</Button>
          </Link>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Navigation / Actions */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-[#2a2a2a] pb-4">
          <Link to="/kb">
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-gray-600 dark:text-gray-400">
              <ArrowLeftIcon className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
          {user?.role === 'admin' && (
            <Link to="/admin/kb/articles/$id" params={{ id: article.id }}>
              <Button size="sm" className="gap-1.5">
                <PencilIcon className="h-4 w-4" />
                Edit Article
              </Button>
            </Link>
          )}
        </div>

        {/* Article Container */}
        <article className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <FolderIcon className="h-3.5 w-3.5" />
                {catName}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3.5 w-3.5" />
                {new Date(article.created_at).toLocaleDateString()}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <EyeIcon className="h-3.5 w-3.5" />
                {article.views} views
              </span>
              {article.status === 'draft' && (
                <>
                  <span>•</span>
                  <Badge variant="secondary">Draft</Badge>
                </>
              )}
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white font-sans">
              {article.title}
            </h1>
          </div>

          {/* Rendered content */}
          <div className="prose dark:prose-invert max-w-none pt-4 border-t border-gray-100 dark:border-[#1a1a1a]">
            {renderMarkdown(article.content)}
          </div>
        </article>
      </div>
    </Layout>
  )
}

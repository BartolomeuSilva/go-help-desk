import { useState, useEffect } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getKBArticle,
  createKBArticle,
  updateKBArticle,
  listKBCategories,
} from '@/api/kb'
import { extractError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { ArrowLeftIcon, FileTextIcon, EyeIcon } from 'lucide-react'

export function KBArticleEditorPage() {
  const { id } = useParams({ strict: false }) as { id?: string }
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isEdit = !!id

  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<'published' | 'draft'>('draft')
  const [content, setContent] = useState('')
  const [error, setError] = useState('')

  // 1. Fetch Article if editing
  const { data: article, isLoading: loadingArticle } = useQuery({
    queryKey: ['kb', 'article', id],
    queryFn: () => getKBArticle(id!),
    enabled: isEdit,
  })

  // Populate form when editing
  useEffect(() => {
    if (article) {
      setTitle(article.title)
      setCategoryId(article.category_id)
      setStatus(article.status)
      setContent(article.content)
    }
  }, [article])

  // 2. Fetch categories for select input
  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: ['admin', 'kb', 'categories'],
    queryFn: () => listKBCategories(),
  })

  // Initialize category if none selected and categories are loaded
  useEffect(() => {
    if (!categoryId && categories.length > 0 && !isEdit) {
      setCategoryId(categories[0].id)
    }
  }, [categories, categoryId, isEdit])

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: () =>
      createKBArticle({
        title: title.trim(),
        category_id: categoryId,
        status,
        content: content.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'kb'] })
      qc.invalidateQueries({ queryKey: ['kb'] })
      navigate({ to: '/admin/kb' })
    },
    onError: (err) => setError(extractError(err)),
  })

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: () =>
      updateKBArticle(id!, {
        title: title.trim(),
        category_id: categoryId,
        status,
        content: content.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'kb'] })
      qc.invalidateQueries({ queryKey: ['kb'] })
      navigate({ to: '/admin/kb' })
    },
    onError: (err) => setError(extractError(err)),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!categoryId) {
      setError('Category is required')
      return
    }
    if (!content.trim()) {
      setError('Content is required')
      return
    }

    if (isEdit) {
      updateMutation.mutate()
    } else {
      createMutation.mutate()
    }
  }

  // Inline Markdown parser/renderer (copied from KBArticleDetailPage.tsx)
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

  const isSaving = createMutation.isPending || updateMutation.isPending

  if (isEdit && loadingArticle) {
    return (
      <Layout>
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Navigation */}
        <div>
          <button
            onClick={() => navigate({ to: '/admin/kb' })}
            className="mb-3 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Back to KB Management
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileTextIcon className="h-6 w-6 text-blue-600 dark:text-[#faff69]" />
            {isEdit ? 'Edit Help Article' : 'Write Help Article'}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Write clear documentation to help users help themselves. Markdown is supported.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Editor Form */}
          <Card className="border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] shadow-sm">
            <CardHeader className="bg-gray-50/50 dark:bg-[#121212]/50 border-b border-gray-200 dark:border-[#2a2a2a] py-4">
              <CardTitle className="text-sm font-semibold text-gray-800 dark:text-white">
                Article Editor
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="art-title">Title *</Label>
                <Input
                  id="art-title"
                  placeholder="e.g. How to reset your password"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isSaving}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="art-category">Category *</Label>
                  {loadingCats ? (
                    <div className="h-10 flex items-center"><Spinner size="sm" /></div>
                  ) : (
                    <Select
                      id="art-category"
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      disabled={isSaving}
                      required
                    >
                      <option value="">Select...</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} {cat.is_public ? '' : '(Private)'}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="art-status">Status *</Label>
                  <Select
                    id="art-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    disabled={isSaving}
                    required
                  >
                    <option value="draft">Draft (Private)</option>
                    <option value="published">Published (Live)</option>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="art-content">Content (Markdown) *</Label>
                <Textarea
                  id="art-content"
                  placeholder="Write article body in Markdown..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={isSaving}
                  className="font-mono min-h-[350px] lg:min-h-[450px]"
                  required
                />
              </div>

              {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Article'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate({ to: '/admin/kb' })}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Live Preview */}
          <Card className="border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] shadow-sm lg:sticky lg:top-6">
            <CardHeader className="bg-gray-50/50 dark:bg-[#121212]/50 border-b border-gray-200 dark:border-[#2a2a2a] py-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <EyeIcon className="h-4 w-4 text-gray-400" />
                Live Preview
              </CardTitle>
              <Badge variant={status === 'published' ? 'default' : 'secondary'}>
                {status}
              </Badge>
            </CardHeader>
            <CardContent className="pt-6">
              {title ? (
                <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white font-sans mb-4 border-b border-gray-100 dark:border-[#1a1a1a] pb-2">
                  {title}
                </h1>
              ) : (
                <p className="text-sm italic text-gray-400 mb-4">No title specified</p>
              )}
              <div className="prose dark:prose-invert max-w-none min-h-[350px] lg:min-h-[450px] max-h-[500px] overflow-y-auto pr-2">
                {content ? (
                  renderMarkdown(content)
                ) : (
                  <p className="text-sm italic text-gray-400">Start typing markdown on the left to see the preview here...</p>
                )}
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </Layout>
  )
}

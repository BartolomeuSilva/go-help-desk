import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  listKBCategories,
  createKBCategory,
  updateKBCategory,
  deleteKBCategory,
  listKBArticlesByCategory,
  deleteKBArticle,
} from '@/api/kb'
import { extractError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { PlusIcon, PencilIcon, Trash2Icon, FolderIcon, FileTextIcon, EyeIcon, BookOpenIcon } from 'lucide-react'
import type { KBCategory, KBArticle } from '@/api/types'

export function KBAdminPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'articles' | 'categories'>('articles')
  const [selectedCatId, setSelectedCatId] = useState<string>('')

  // Category Form State
  const [isEditingCat, setIsEditingCat] = useState(false)
  const [editCatId, setEditCatId] = useState<string | null>(null)
  const [catName, setCatName] = useState('')
  const [catDescription, setCatDescription] = useState('')
  const [catIsPublic, setCatIsPublic] = useState(true)
  const [catFormError, setCatFormError] = useState('')

  // Delete State
  const [pendingDeleteCat, setPendingDeleteCat] = useState<KBCategory | null>(null)
  const [pendingDeleteArticle, setPendingDeleteArticle] = useState<KBArticle | null>(null)

  // Fetch KB Categories
  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: ['admin', 'kb', 'categories'],
    queryFn: () => listKBCategories(),
  })

  // Set default selected category once categories load
  if (!selectedCatId && categories.length > 0) {
    setSelectedCatId(categories[0].id)
  }

  // Fetch articles for active category
  const { data: articles = [], isLoading: loadingArticles } = useQuery({
    queryKey: ['admin', 'kb', 'articles', selectedCatId],
    queryFn: () => listKBArticlesByCategory(selectedCatId),
    enabled: selectedCatId !== '',
  })

  // Category Mutations
  const createCatMutation = useMutation({
    mutationFn: () =>
      createKBCategory({ name: catName.trim(), description: catDescription.trim(), is_public: catIsPublic }),
    onSuccess: () => {
      resetCatForm()
      qc.invalidateQueries({ queryKey: ['admin', 'kb', 'categories'] })
    },
    onError: (err) => setCatFormError(extractError(err)),
  })

  const updateCatMutation = useMutation({
    mutationFn: (id: string) =>
      updateKBCategory(id, { name: catName.trim(), description: catDescription.trim(), is_public: catIsPublic }),
    onSuccess: () => {
      resetCatForm()
      qc.invalidateQueries({ queryKey: ['admin', 'kb', 'categories'] })
    },
    onError: (err) => setCatFormError(extractError(err)),
  })

  const deleteCatMutation = useMutation({
    mutationFn: (id: string) => deleteKBCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'kb', 'categories'] })
      setPendingDeleteCat(null)
      if (selectedCatId === pendingDeleteCat?.id) {
        setSelectedCatId('')
      }
    },
  })

  // Article Mutations
  const deleteArticleMutation = useMutation({
    mutationFn: (id: string) => deleteKBArticle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'kb', 'articles', selectedCatId] })
      setPendingDeleteArticle(null)
    },
  })

  const handleEditCatClick = (cat: KBCategory) => {
    setIsEditingCat(true)
    setEditCatId(cat.id)
    setCatName(cat.name)
    setCatDescription(cat.description)
    setCatIsPublic(cat.is_public)
    setCatFormError('')
  }

  const handleNewCatClick = () => {
    setIsEditingCat(true)
    setEditCatId(null)
    setCatName('')
    setCatDescription('')
    setCatIsPublic(true)
    setCatFormError('')
  }

  const resetCatForm = () => {
    setIsEditingCat(false)
    setEditCatId(null)
    setCatName('')
    setCatDescription('')
    setCatIsPublic(true)
    setCatFormError('')
  }

  const handleCatSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!catName.trim()) {
      setCatFormError('Category name is required')
      return
    }
    if (editCatId) {
      updateCatMutation.mutate(editCatId)
    } else {
      createCatMutation.mutate()
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-[#2a2a2a] pb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <BookOpenIcon className="h-6 w-6 text-blue-600 dark:text-[#faff69]" />
              Knowledge Base Management
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage help categories and write help articles to help customers resolve issues.
            </p>
          </div>
          {activeTab === 'articles' && (
            <Link to="/admin/kb/articles/new">
              <Button>
                <PlusIcon className="mr-2 h-4 w-4" />
                New Article
              </Button>
            </Link>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-[#2a2a2a] gap-4">
          <button
            onClick={() => setActiveTab('articles')}
            className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'articles'
                ? 'border-blue-600 dark:border-[#faff69] text-blue-600 dark:text-[#faff69]'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'
            }`}
          >
            Articles
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'categories'
                ? 'border-blue-600 dark:border-[#faff69] text-blue-600 dark:text-[#faff69]'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'
            }`}
          >
            Categories
          </button>
        </div>

        {/* ── ARTICLES TAB ──────────────────────────────────────────────────────── */}
        {activeTab === 'articles' && (
          <div className="grid md:grid-cols-4 gap-6">
            {/* Sidebar list of categories */}
            <div className="md:col-span-1 space-y-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Filter by Category
              </h3>
              {loadingCats ? (
                <Spinner size="sm" />
              ) : (
                <div className="flex flex-col gap-1">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCatId(cat.id)}
                      className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                        selectedCatId === cat.id
                          ? 'bg-blue-50 dark:bg-[#1a1a1a] text-blue-700 dark:text-[#faff69]'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#121212]'
                      }`}
                    >
                      <FolderIcon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{cat.name}</span>
                    </button>
                  ))}
                  {categories.length === 0 && (
                    <p className="text-xs text-gray-500">Create a category first.</p>
                  )}
                </div>
              )}
            </div>

            {/* Articles List */}
            <div className="md:col-span-3">
              {loadingArticles ? (
                <div className="flex justify-center py-12">
                  <Spinner />
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a] rounded-lg overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-[#121212] text-xs text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-[#2a2a2a]">
                      <tr>
                        <th className="px-4 py-3 text-left">Title</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Views</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-[#1a1a1a]">
                      {articles.map((art) => (
                        <tr key={art.id} className="hover:bg-gray-50/50 dark:hover:bg-[#121212]/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                              <FileTextIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                              {art.title}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={art.status === 'published' ? 'default' : 'secondary'}>
                              {art.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1 text-xs">
                              <EyeIcon className="h-3.5 w-3.5" /> {art.views}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Link to="/admin/kb/articles/$id" params={{ id: art.id }}>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Edit Article">
                                  <PencilIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                </Button>
                              </Link>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                                onClick={() => setPendingDeleteArticle(art)}
                                title="Delete Article"
                              >
                                <Trash2Icon className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {articles.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                            Nenhum artigo cadastrado nesta categoria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CATEGORIES TAB ────────────────────────────────────────────────────── */}
        {activeTab === 'categories' && (
          <div className="space-y-6">
            {!isEditingCat && (
              <div className="flex justify-end">
                <Button onClick={handleNewCatClick}>
                  <PlusIcon className="mr-2 h-4 w-4" />
                  New Category
                </Button>
              </div>
            )}

            {/* Category Form */}
            {isEditingCat && (
              <Card className="border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] shadow-sm max-w-xl">
                <CardHeader className="bg-gray-50/50 dark:bg-[#121212]/50 border-b border-gray-200 dark:border-[#2a2a2a] py-4">
                  <CardTitle className="text-sm font-semibold text-gray-800 dark:text-white">
                    {editCatId ? 'Edit Category' : 'New Category'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <form onSubmit={handleCatSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="cat-name">Name</Label>
                      <Input
                        id="cat-name"
                        placeholder="e.g. Instalações e Updates"
                        value={catName}
                        onChange={(e) => {
                          setCatName(e.target.value)
                          setCatFormError('')
                        }}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cat-desc">Description</Label>
                      <Textarea
                        id="cat-desc"
                        placeholder="Resumo de artigos relacionados a..."
                        rows={3}
                        value={catDescription}
                        onChange={(e) => setCatDescription(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="cat-public"
                        checked={catIsPublic}
                        onChange={(e) => setCatIsPublic(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4 dark:bg-[#1a1a1a] dark:border-[#2a2a2a]"
                      />
                      <Label htmlFor="cat-public" className="cursor-pointer">
                        Pública (visível para clientes não logados)
                      </Label>
                    </div>

                    {catFormError && <p className="text-sm text-red-600 font-medium">{catFormError}</p>}
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        type="submit"
                        disabled={
                          !catName.trim() || createCatMutation.isPending || updateCatMutation.isPending
                        }
                      >
                        {createCatMutation.isPending || updateCatMutation.isPending ? 'Saving…' : 'Save'}
                      </Button>
                      <Button type="button" variant="outline" onClick={resetCatForm}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Categories Table */}
            {loadingCats ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : (
              <div className="border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a] rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-[#121212] text-xs text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-[#2a2a2a]">
                    <tr>
                      <th className="px-4 py-3 text-left">Category Name</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-left">Visibility</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-[#1a1a1a]">
                    {categories.map((cat) => (
                      <tr key={cat.id} className="hover:bg-gray-50/50 dark:hover:bg-[#121212]/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                            <FolderIcon className="h-4 w-4 text-blue-500 dark:text-[#faff69]" />
                            {cat.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-sm truncate">
                          {cat.description || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={cat.is_public ? 'default' : 'secondary'}>
                            {cat.is_public ? 'Public' : 'Private'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={() => handleEditCatClick(cat)}
                              title="Edit Category"
                            >
                              <PencilIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                              onClick={() => setPendingDeleteCat(cat)}
                              title="Delete Category"
                            >
                              <Trash2Icon className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {categories.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                          Nenhuma categoria cadastrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Category Confirmation */}
      <ConfirmDialog
        open={pendingDeleteCat !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteCat(null)
        }}
        title={`Delete category "${pendingDeleteCat?.name ?? ''}"?`}
        description="Are you sure? Removing this category will permanently delete all its associated articles! This action cannot be undone."
        confirmLabel="Delete"
        isPending={deleteCatMutation.isPending}
        onConfirm={() => {
          if (pendingDeleteCat) deleteCatMutation.mutate(pendingDeleteCat.id)
        }}
      />

      {/* Delete Article Confirmation */}
      <ConfirmDialog
        open={pendingDeleteArticle !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteArticle(null)
        }}
        title={`Delete article "${pendingDeleteArticle?.title ?? ''}"?`}
        description="Are you sure you want to permanently delete this help article? This action cannot be undone."
        confirmLabel="Delete"
        isPending={deleteArticleMutation.isPending}
        onConfirm={() => {
          if (pendingDeleteArticle) deleteArticleMutation.mutate(pendingDeleteArticle.id)
        }}
      />
    </Layout>
  )
}

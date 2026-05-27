import { api } from './client'
import type { KBCategory, KBArticle } from './types'

// ── Public / Shared endpoints ──────────────────────────────────────────────────

export async function listKBCategories(): Promise<KBCategory[]> {
  const res = await api.get<KBCategory[]>('/kb/categories')
  return res.data
}

export async function getKBArticle(id: string): Promise<KBArticle> {
  const res = await api.get<KBArticle>(`/kb/articles/${id}`)
  return res.data
}

export async function listKBArticlesByCategory(catId: string): Promise<KBArticle[]> {
  const res = await api.get<KBArticle[]>(`/kb/categories/${catId}/articles`)
  return res.data
}

// ── Admin endpoints ────────────────────────────────────────────────────────────

export async function createKBCategory(input: {
  name: string
  description: string
  is_public: boolean
}): Promise<KBCategory> {
  const res = await api.post<KBCategory>('/admin/kb/categories', input)
  return res.data
}

export async function updateKBCategory(
  id: string,
  input: {
    name: string
    description: string
    is_public: boolean
  }
): Promise<KBCategory> {
  const res = await api.patch<KBCategory>(`/admin/kb/categories/${id}`, input)
  return res.data
}

export async function deleteKBCategory(id: string): Promise<void> {
  await api.delete(`/admin/kb/categories/${id}`)
}

export async function createKBArticle(input: {
  category_id: string
  title: string
  content: string
  status: string
}): Promise<KBArticle> {
  const res = await api.post<KBArticle>('/admin/kb/articles', input)
  return res.data
}

export async function updateKBArticle(
  id: string,
  input: {
    category_id: string
    title: string
    content: string
    status: string
  }
): Promise<KBArticle> {
  const res = await api.patch<KBArticle>(`/admin/kb/articles/${id}`, input)
  return res.data
}

export async function deleteKBArticle(id: string): Promise<void> {
  await api.delete(`/admin/kb/articles/${id}`)
}

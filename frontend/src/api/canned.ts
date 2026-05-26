import { api } from './client'
import type { CannedResponse } from './types'

export async function listCannedResponses(): Promise<CannedResponse[]> {
  const res = await api.get<CannedResponse[]>('/canned-responses')
  return res.data
}

export async function createCannedResponse(input: {
  name: string
  content: string
}): Promise<CannedResponse> {
  const res = await api.post<CannedResponse>('/admin/canned-responses', input)
  return res.data
}

export async function updateCannedResponse(
  id: string,
  patch: {
    name?: string
    content?: string
  }
): Promise<CannedResponse> {
  const res = await api.patch<CannedResponse>(`/admin/canned-responses/${id}`, patch)
  return res.data
}

export async function deleteCannedResponse(id: string): Promise<void> {
  await api.delete(`/admin/canned-responses/${id}`)
}

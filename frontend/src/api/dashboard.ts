import { api } from './client'
import type { DashboardSummary } from './types'

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const resp = await api.get('/dashboard/summary')
  return resp.data
}

import { client } from './client'
import type { DashboardSummary } from './types'

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const resp = await client.get('/dashboard/summary')
  return resp.data
}

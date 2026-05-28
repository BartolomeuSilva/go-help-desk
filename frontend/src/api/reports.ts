import { api } from './client'

export interface AgentCSAT {
  user_id: string
  user_name: string
  user_email: string
  rated_tickets_count: number
  csat_average: number
}

export interface CSATReport {
  csat_average: number
  rated_tickets_count: number
  stars_distribution: Record<number, number>
  agent_performance: AgentCSAT[]
  ai_sentiment_summary: string
  ai_coaching_tips: string[]
}

export async function getCSATReport(
  assigneeId?: string,
  reporterId?: string
): Promise<CSATReport> {
  const res = await api.get<CSATReport>('/admin/reports/csat', {
    params: {
      ...(assigneeId ? { assignee_id: assigneeId } : {}),
      ...(reporterId ? { reporter_id: reporterId } : {}),
    },
  })
  return res.data
}

export async function sendCSATFeedback(input: {
  agent_id: string
  sentiment_summary: string
  coaching_tips: string[]
}): Promise<void> {
  await api.post('/admin/reports/csat/send-feedback', input)
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCSATReport, sendCSATFeedback } from '@/api/reports'
import { listUsers } from '@/api/admin'
import { extractError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Star, Sparkles, AlertCircle, RefreshCw, Trophy, Users, StarHalf, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

// Helper para renderizar estrelas com base em uma nota (0 a 5)
function RenderStars({ rating }: { rating: number }) {
  const stars = []
  const fullStars = Math.floor(rating)
  const hasHalfStar = rating % 1 >= 0.25 && rating % 1 <= 0.75
  const fullStarsCount = hasHalfStar ? fullStars : Math.round(rating)

  for (let i = 1; i <= 5; i++) {
    if (i <= fullStarsCount) {
      stars.push(<Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400 animate-pulse" />)
    } else if (i === fullStarsCount + 1 && hasHalfStar) {
      stars.push(<StarHalf key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />)
    } else {
      stars.push(<Star key={i} className="h-5 w-5 text-gray-300 dark:text-gray-600" />)
    }
  }

  return <div className="flex items-center gap-0.5">{stars}</div>
}

export function CSATReportPage() {
  const { t } = useT()
  const qc = useQueryClient()
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [sendSuccess, setSendSuccess] = useState<boolean>(false)
  const [sendError, setSendError] = useState<string>('')

  // 1. Obter a lista de usuários da staff para o filtro
  const { data: users = [] } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => listUsers(200, 0),
    staleTime: 5 * 60 * 1000,
  })

  // Filtrar usuários com papel admin ou staff
  const staffMembers = users.filter((u) => u.role === 'admin' || u.role === 'staff')
  // Filtrar usuários com papel user (clientes)
  const clientMembers = users.filter((u) => u.role === 'user')

  // 2. Buscar o relatório de CSAT (filtrado ou geral)
  const { data, isLoading, error, isRefetching } = useQuery({
    queryKey: ['admin', 'reports', 'csat', selectedAgentId, selectedClientId],
    queryFn: () => getCSATReport(selectedAgentId || undefined, selectedClientId || undefined),
    staleTime: 60 * 1000, // 1 minuto
  })

  // 3. Mutação para envio do e-mail de feedback
  const sendFeedbackMutation = useMutation({
    mutationFn: sendCSATFeedback,
    onSuccess: () => {
      setSendSuccess(true)
      setSendError('')
      setTimeout(() => setSendSuccess(false), 5000)
    },
    onError: (err) => {
      setSendError(extractError(err))
      setSendSuccess(false)
    },
  })

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['admin', 'reports', 'csat'] })
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
          <Spinner />
          <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">{t('csat.loading')}</p>
        </div>
      </Layout>
    )
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="flex h-[50vh] flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('csat.error_title')}</h2>
          <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
            {t('csat.error_desc')}
          </p>
          <Button onClick={handleRefresh} className="mt-2">
            {t('csat.retry')}
          </Button>
        </div>
      </Layout>
    )
  }

  const {
    csat_average = 0,
    rated_tickets_count = 0,
    stars_distribution = {},
    agent_performance = [],
    ai_sentiment_summary = '',
    ai_coaching_tips = [],
  } = data

  // Calcula a porcentagem para as barras de distribuição
  const maxDistributionCount = Math.max(...Object.values(stars_distribution), 1)
  const selectedAgent = staffMembers.find((u) => u.id === selectedAgentId)

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{t('csat.title')}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('csat.subtitle')}
            </p>
          </div>
          
          <div className="flex flex-wrap items-end justify-end gap-3 sm:gap-4 border-b border-gray-100 dark:border-[#2a2a2a] pb-4">
            {/* Seletor de Filtro de Atendente */}
            <div className="flex flex-col gap-1 w-[calc(50%-0.5rem)] sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              <span className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('csat.filter_agent')}</span>
              <Select
                className="w-full sm:w-48 text-sm"
                value={selectedAgentId}
                onChange={(e) => {
                  setSelectedAgentId(e.target.value)
                  setSendSuccess(false)
                  setSendError('')
                }}
              >
                <option value="">{t('csat.filter_agent_all')}</option>
                {staffMembers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Seletor de Filtro de Cliente */}
            <div className="flex flex-col gap-1 w-[calc(50%-0.5rem)] sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              <span className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('csat.filter_customer')}</span>
              <Select
                className="w-full sm:w-48 text-sm"
                value={selectedClientId}
                onChange={(e) => {
                  setSelectedClientId(e.target.value)
                  setSendSuccess(false)
                  setSendError('')
                }}
              >
                <option value="">{t('csat.filter_customer_all')}</option>
                {clientMembers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name}
                  </option>
                ))}
              </Select>
            </div>

            <Button
              onClick={handleRefresh}
              variant="outline"
              disabled={isRefetching}
              className="w-full sm:w-auto flex items-center justify-center gap-2 border-gray-200 dark:border-[#2a2a2a] hover:bg-gray-100 dark:hover:bg-[#1a1a1a] cursor-pointer text-sm py-2 h-10"
            >
              <RefreshCw className={cn('h-4 w-4 text-gray-500', isRefetching && 'animate-spin')} />
              {isRefetching ? t('csat.updating') : t('csat.update_data')}
            </Button>
          </div>
        </div>

        {/* Métricas e Distribuição */}
        <div className="grid gap-6 md:grid-cols-12">
          {/* Card Score Geral */}
          <div className="flex flex-col justify-between rounded-2xl border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] p-6 shadow-sm md:col-span-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wider text-gray-400">{t('csat.average_score')}</span>
                <Trophy className="h-5 w-5 text-yellow-500" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                  {csat_average.toFixed(2)}
                </span>
                <span className="text-lg text-gray-400">/ 5.00</span>
              </div>
              <div className="mt-2">
                <RenderStars rating={csat_average} />
              </div>
            </div>
            <div className="mt-6 border-t border-gray-100 dark:border-[#2a2a2a] pt-4">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('csat.calculated_from_prefix')} <strong className="font-semibold text-gray-900 dark:text-white">{rated_tickets_count}</strong> {t('csat.calculated_from_suffix')}
              </span>
            </div>
          </div>

          {/* Gráfico de Distribuição das Estrelas */}
          <div className="rounded-2xl border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] p-6 shadow-sm md:col-span-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">{t('csat.distribution')}</h3>
            <div className="space-y-3.5">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = stars_distribution[stars] || 0
                const percent = rated_tickets_count > 0 ? (count / rated_tickets_count) * 100 : 0
                const relativeWidth = rated_tickets_count > 0 ? (count / maxDistributionCount) * 100 : 0

                return (
                  <div key={stars} className="flex items-center gap-3">
                    <span className="w-12 text-sm font-medium text-gray-600 dark:text-[#cccccc] flex items-center justify-end gap-1">
                      {stars} <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    </span>
                    <div className="h-3 flex-1 rounded-full bg-gray-100 dark:bg-[#0a0a0a] overflow-hidden">
                      <div
                        style={{ width: `${relativeWidth}%` }}
                        className={cn(
                          'h-full rounded-full transition-all duration-500 ease-out',
                          stars >= 4 ? 'bg-emerald-500 dark:bg-emerald-600' :
                            stars === 3 ? 'bg-yellow-400 dark:bg-yellow-500' :
                              'bg-rose-500 dark:bg-rose-600'
                        )}
                      />
                    </div>
                    <span className="w-16 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 tabular-nums">
                      {count} ({percent.toFixed(0)}%)
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* IA Coach - Seção Especial */}
        <div className="relative overflow-hidden rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/30 dark:from-[#0a0f1d] dark:via-[#13192e] dark:to-[#0a0f1d] p-6 shadow-md shadow-indigo-100/40 dark:shadow-none">
          {/* Decoração Glow IA */}
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-400/10 blur-3xl pointer-events-none" />

          <div className="flex items-center gap-2 pb-4 border-b border-blue-100 dark:border-blue-900/30">
            <Sparkles className="h-6 w-6 text-blue-600 dark:text-[#faff69] animate-pulse" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              {t('csat.ai_coach_title')} <span className="rounded-full bg-blue-100 dark:bg-[#2c2f21] px-2 py-0.5 text-2xs font-semibold text-blue-700 dark:text-[#faff69]">Gemini 3.5 Flash</span>
            </h2>
          </div>

          <div className="mt-5 grid gap-6 md:grid-cols-12 pb-4">
            {/* Resumo do Sentimento */}
            <div className="md:col-span-7 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600/80 dark:text-[#faff69]/80">{t('csat.ai_sentiment_title')}</h3>
              <p className="text-sm leading-relaxed text-gray-700">
                {ai_sentiment_summary}
              </p>
            </div>

            {/* Dicas de Coaching */}
            <div className="md:col-span-5 space-y-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600/80 dark:text-[#faff69]/80">{t('csat.ai_coaching_title')}</h3>
              {ai_coaching_tips.length > 0 ? (
                <ul className="space-y-3">
                  {ai_coaching_tips.map((tip, idx) => (
                    <li key={idx} className="flex gap-2 text-sm items-start text-gray-700">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-xs font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                        {idx + 1}
                      </span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 dark:border-[#2a2a2a] p-4 text-center text-xs text-gray-500">
                  {t('csat.ai_no_tips')}
                </div>
              )}
            </div>
          </div>

          {/* Ação de Envio de Feedback para o Atendente */}
          {selectedAgentId && (
            <div className="mt-5 pt-5 border-t border-blue-100 dark:border-blue-900/30 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('csat.share_desc')}
              </div>
              <div className="flex items-center gap-3">
                {sendSuccess && (
                  <span className="text-sm font-medium text-green-600 dark:text-green-400 animate-pulse">
                    {t('csat.share_success')}
                  </span>
                )}
                {sendError && (
                  <span className="text-sm font-medium text-red-600 dark:text-red-400">
                    {t('csat.share_error')} {sendError}
                  </span>
                )}
                 <Button
                  onClick={() => {
                    sendFeedbackMutation.mutate({
                      agent_id: selectedAgentId,
                      sentiment_summary: ai_sentiment_summary,
                      coaching_tips: ai_coaching_tips,
                    })
                  }}
                  disabled={sendFeedbackMutation.isPending || ai_coaching_tips.length === 0}
                  className="flex items-center gap-2 font-medium shadow-sm transition-all hover:scale-105 active:scale-95"
                >
                  {sendFeedbackMutation.isPending ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  {sendFeedbackMutation.isPending
                    ? t('csat.sharing')
                    : `${t('csat.share_button_prefix')} ${selectedAgent?.display_name || t('csat.table_agent')}`}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Tabela de Desempenho por Agente */}
        <div className="rounded-2xl border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] shadow-sm">
          <div className="border-b border-gray-100 dark:border-[#2a2a2a] px-6 py-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <Users className="h-4 w-4" /> {t('csat.agent_performance_title')}
            </h3>
            <span className="text-xs text-gray-400">{t('csat.agent_performance_desc')}</span>
          </div>

          {agent_performance.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-[#0a0a0a] text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-6 py-3">{t('csat.table_agent')}</th>
                    <th className="px-6 py-3 text-center">{t('csat.table_rated_tickets')}</th>
                    <th className="px-6 py-3 text-right">{t('csat.table_average')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
                  {agent_performance.map((agent) => (
                    <tr
                      key={agent.user_id}
                      className={cn(
                        'hover:bg-gray-50 dark:hover:bg-[#151515] transition-colors cursor-pointer',
                        selectedAgentId === agent.user_id && 'bg-blue-50/50 dark:bg-blue-900/10'
                      )}
                      onClick={() => {
                        setSelectedAgentId(selectedAgentId === agent.user_id ? '' : agent.user_id)
                        setSendSuccess(false)
                        setSendError('')
                      }}
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                            {agent.user_name}
                            {selectedAgentId === agent.user_id && (
                              <span className="rounded-full bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-3xs font-semibold text-blue-700 dark:text-blue-200">
                                {t('csat.badge_filtered')}
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{agent.user_email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-medium text-gray-700 tabular-nums">
                        {agent.rated_tickets_count}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2.5">
                          <RenderStars rating={agent.csat_average} />
                          <span className="w-10 text-right font-bold text-gray-900 dark:text-white tabular-nums">
                            {agent.csat_average.toFixed(2)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('csat.no_agent_performance')}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

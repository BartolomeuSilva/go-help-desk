import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { listTickets, type TicketScope } from '@/api/tickets'
import { listStatuses, getSiteConfig } from '@/api/admin'
import { useAuthStore } from '@/store/auth'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { useT } from '@/i18n'

function priorityVariant(p: string) {
  if (p === 'critical') return 'destructive'
  if (p === 'high') return 'warning'
  if (p === 'medium') return 'default'
  return 'secondary'
}

export function TicketListPage() {
  const { t, tStatus } = useT()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [includeClosed, setIncludeClosed] = useState(false)
  const [scope, setScope] = useState<TicketScope>('mine')

  // 300 ms debounce on the search box
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(id)
  }, [query])

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: listStatuses,
  })

  const { data: siteConfig } = useQuery({
    queryKey: ['site-config'],
    queryFn: getSiteConfig,
  })
  const slaActive = siteConfig?.sla_enabled ?? false

  // Non-admins are always scoped to "mine" — the backend rejects other scopes.
  const effectiveScope: TicketScope = isAdmin ? scope : 'mine'

  // Always fetch; pass search query to backend when present.
  const { data: allTickets = [], isFetching } = useQuery({
    queryKey: ['tickets', { q: debouncedQuery || undefined, scope: effectiveScope }],
    queryFn: () =>
      listTickets({
        q: debouncedQuery || undefined,
        scope: effectiveScope,
      }),
  })

  // IDs of statuses named "Closed" — filtered out unless the toggle is on.
  const closedIds = useMemo(
    () => new Set(statuses.filter(s => s.name === 'Closed').map(s => s.id)),
    [statuses],
  )

  const tickets = useMemo(
    () => includeClosed ? allTickets : allTickets.filter(t => !closedIds.has(t.status_id)),
    [allTickets, includeClosed, closedIds],
  )

  function statusFor(id: string) {
    return statuses.find(s => s.id === id)
  }

  function emptyMessageFor(s: TicketScope) {
    switch (s) {
      case 'unassigned':
        return t('tickets.list.empty_unassigned')
      case 'all':
        return t('tickets.list.empty_all')
      default:
        return t('tickets.list.empty_mine')
    }
  }

  function scopeLabel(s: TicketScope) {
    switch (s) {
      case 'mine':
        return t('tickets.list.scope_mine')
      case 'unassigned':
        return t('tickets.list.scope_unassigned')
      case 'all':
        return t('tickets.list.scope_all')
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tickets</h1>
          <Link to="/tickets/new">
            <Button>
              <PlusIcon className="mr-2 h-4 w-4" />
              {t('tickets.list.new')}
            </Button>
          </Link>
        </div>

        {/* Toolbar: search + scope + closed toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-lg">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <Input
              className="pl-9"
              placeholder={t('tickets.list.search_placeholder')}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          {isAdmin && (
            <div className="inline-flex rounded-md border border-gray-200 dark:border-[#2a2a2a] overflow-hidden text-sm">
              {(['mine', 'unassigned', 'all'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={
                    'px-3 py-1.5 transition-colors ' +
                    (scope === s
                      ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                      : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-[#1a1a1a] dark:text-[#cccccc] dark:hover:bg-[#242424]')
                  }
                >
                  {scopeLabel(s)}
                </button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 dark:bg-[#1a1a1a]"
              checked={includeClosed}
              onChange={e => setIncludeClosed(e.target.checked)}
            />
            {t('tickets.list.include_closed')}
          </label>
        </div>

        {/* Results */}
        {isFetching && allTickets.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Spinner size="sm" /> {t('tickets.list.loading')}
          </div>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
            {query
              ? t('tickets.list.no_match')
              : emptyMessageFor(effectiveScope)}
          </p>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-hidden rounded-md border border-gray-200 dark:border-[#2a2a2a]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-[#121212] text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-2 text-left">{t('tickets.list.header_ticket')}</th>
                    <th className="px-4 py-2 text-left">{t('tickets.list.header_subject')}</th>
                    <th className="px-4 py-2 text-left">{t('tickets.list.header_status')}</th>
                    <th className="px-4 py-2 text-left">{t('tickets.list.header_priority')}</th>
                    {slaActive && <th className="px-4 py-2 text-left">{t('tickets.list.header_sla')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a2a] bg-white dark:bg-[#0a0a0a]">
                  {tickets.map(ticket => {
                    const status = statusFor(ticket.status_id)
                    return (
                      <tr
                        key={ticket.id}
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                        onClick={() => navigate({ to: '/tickets/$id', params: { id: ticket.id } })}
                      >
                        <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">
                          {ticket.tracking_number}
                        </td>
                        <td className="px-4 py-2 font-medium text-gray-900 dark:text-white max-w-xs truncate flex items-center gap-1.5">
                          {ticket.source === 'whatsapp' && (
                            <svg className="h-4 w-4 text-[#25D366] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.965C16.788 1.978 14.32 1.95 12.008 1.95c-5.442 0-9.866 4.372-9.87 9.802 0 1.706.467 3.376 1.353 4.851L2.484 21.5l5.003-1.309zM18.66 14.86c-.36-.18-2.14-1.055-2.47-1.176-.33-.12-.57-.18-.81.18-.24.36-.93 1.176-1.14 1.416-.21.24-.42.27-.78.09-3.48-1.745-4.815-3.055-5.69-4.575-.24-.42-.03-.63.15-.84.162-.187.36-.42.54-.63.18-.21.24-.36.36-.6.12-.24.06-.45-.03-.63-.09-.18-.81-1.95-1.11-2.67-.3-.72-.6-1.11-.81-1.11-.21 0-.45-.03-.69-.03-.24 0-.63.09-.96.45-.33.36-1.26 1.23-1.26 3 .0 1.77 1.29 3.48 1.47 3.72.18.24 2.535 3.87 6.14 5.425 2.145.925 3.015 1.085 4.1.925.685-.1 2.14-.875 2.44-1.725.3-.85.3-1.58.21-1.725-.09-.15-.33-.24-.69-.42z"/>
                            </svg>
                          )}
                          <span className="truncate">{ticket.subject}</span>
                        </td>
                        <td className="px-4 py-2">
                          {status ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                              style={{ borderColor: status.color, color: status.color }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} />
                              {tStatus(status.name)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={priorityVariant(ticket.priority) as never}>
                            {t(`ticket.priority_${ticket.priority}` as any)}
                          </Badge>
                        </td>
                        {slaActive && (
                          <td className="px-4 py-2 whitespace-nowrap">
                            {ticket.sla ? (
                              <span
                                className={
                                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ' +
                                  (ticket.sla.status === 'red'
                                    ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50'
                                    : ticket.sla.status === 'amber'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50'
                                    : 'bg-green-50 text-green-700 border border-green-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50')
                                }
                              >
                                <span
                                  className={
                                    'h-1.5 w-1.5 rounded-full ' +
                                    (ticket.sla.status === 'red'
                                      ? 'bg-red-600'
                                      : ticket.sla.status === 'amber'
                                      ? 'bg-amber-600'
                                      : 'bg-emerald-600')
                                  }
                                />
                                {ticket.sla.status === 'red'
                                  ? t('tickets.list.sla_breached')
                                  : ticket.sla.status === 'amber'
                                  ? t('tickets.list.sla_critical')
                                  : t('tickets.list.sla_within')}
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-600 text-xs">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="block sm:hidden space-y-3">
              {tickets.map(ticket => {
                const status = statusFor(ticket.status_id)
                return (
                  <div
                    key={ticket.id}
                    onClick={() => navigate({ to: '/tickets/$id', params: { id: ticket.id } })}
                    className="active:bg-gray-100 dark:active:bg-[#1a1a1a] bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-4 space-y-3 cursor-pointer shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                        {ticket.tracking_number}
                      </span>
                      {status ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                          style={{ borderColor: status.color, color: status.color }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} />
                          {tStatus(status.name)}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </div>

                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-2 flex items-center gap-1.5">
                      {ticket.source === 'whatsapp' && (
                        <svg className="h-4 w-4 text-[#25D366] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.965C16.788 1.978 14.32 1.95 12.008 1.95c-5.442 0-9.866 4.372-9.87 9.802 0 1.706.467 3.376 1.353 4.851L2.484 21.5l5.003-1.309zM18.66 14.86c-.36-.18-2.14-1.055-2.47-1.176-.33-.12-.57-.18-.81.18-.24.36-.93 1.176-1.14 1.416-.21.24-.42.27-.78.09-3.48-1.745-4.815-3.055-5.69-4.575-.24-.42-.03-.63.15-.84.162-.187.36-.42.54-.63.18-.21.24-.36.36-.6.12-.24.06-.45-.03-.63-.09-.18-.81-1.95-1.11-2.67-.3-.72-.6-1.11-.81-1.11-.21 0-.45-.03-.69-.03-.24 0-.63.09-.96.45-.33.36-1.26 1.23-1.26 3 .0 1.77 1.29 3.48 1.47 3.72.18.24 2.535 3.87 6.14 5.425 2.145.925 3.015 1.085 4.1.925.685-.1 2.14-.875 2.44-1.725.3-.85.3-1.58.21-1.725-.09-.15-.33-.24-.69-.42z"/>
                        </svg>
                      )}
                      <span>{ticket.subject}</span>
                    </h3>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-[#262626] text-xs">
                      <Badge variant={priorityVariant(ticket.priority) as never} className="text-[10px]">
                        {t(`ticket.priority_${ticket.priority}` as any)}
                      </Badge>

                      {slaActive && ticket.sla && (
                        <span
                          className={
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ' +
                            (ticket.sla.status === 'red'
                              ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                              : ticket.sla.status === 'amber'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                              : 'bg-green-50 text-green-700 dark:bg-emerald-950/40 dark:text-emerald-400')
                          }
                        >
                          <span
                            className={
                              'h-1 w-1 rounded-full ' +
                              (ticket.sla.status === 'red'
                                ? 'bg-red-600'
                                : ticket.sla.status === 'amber'
                                ? 'bg-amber-600'
                                : 'bg-emerald-600')
                            }
                          />
                          {ticket.sla.status === 'red'
                            ? t('tickets.list.sla_breached')
                            : ticket.sla.status === 'amber'
                            ? t('tickets.list.sla_critical')
                            : t('tickets.list.sla_within')}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}

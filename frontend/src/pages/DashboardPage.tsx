import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useAuthStore } from '@/store/auth'
import { useT } from '@/i18n'
import { getDashboardSummary } from '@/api/dashboard'
import { Layout } from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { PlusIcon, UserIcon, UsersIcon, ClockIcon } from 'lucide-react'

export function DashboardPage() {
  const { user } = useAuthStore()
  const { t, tStatus } = useT()

  const { data: summary, isLoading } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: getDashboardSummary,
  })

  const isStaff = user?.role === 'staff' || user?.role === 'admin'

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString(undefined, { 
      day: '2-digit', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('dashboard.title')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.welcome')}, {user?.display_name}</p>
          </div>
          <Link to="/tickets/new">
            <Button className="bg-[#faff69] text-black hover:bg-[#e6eb52] dark:bg-[#faff69] dark:text-black">
              <PlusIcon className="mr-2 h-4 w-4" />
              {t('dashboard.new_ticket')}
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <>
            {/* Status Grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {summary?.statuses.filter((s) => s.active).map((s) => (
                <Card key={s.id} className="border-l-4 bg-white dark:bg-[#0a0a0a] dark:border-[#2a2a2a]" style={{ borderLeftColor: s.color }}>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {tStatus(s.name)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.ticket_count}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Staff Lists */}
            {isStaff && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* My Recent Tickets */}
                <Card className="flex flex-col border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-4 w-4 text-blue-500" />
                      <CardTitle className="text-base font-semibold">{t('dashboard.my_tickets')}</CardTitle>
                    </div>
                    <Link to="/tickets">
                      <Button variant="ghost" size="sm" className="text-xs text-blue-600 dark:text-[#faff69]">
                        {t('common.view_all')}
                      </Button>
                    </Link>
                  </CardHeader>
                  <CardContent className="flex-1 px-0 pb-0">
                    <div className="divide-y divide-gray-100 dark:divide-[#1a1a1a]">
                      {summary?.my_recent_tickets.length === 0 ? (
                        <p className="px-6 py-8 text-center text-sm text-gray-500">{t('dashboard.no_tickets')}</p>
                      ) : (
                        summary?.my_recent_tickets.map((tk) => (
                          <Link key={tk.id} to="/tickets/$id" params={{ id: tk.id }} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-[#111]">
                            <div className="min-w-0 flex-1 pr-4">
                              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{tk.subject}</p>
                              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                                <span className="font-mono text-[10px]">{tk.tracking_number}</span>
                                <span>•</span>
                                <span>{formatDate(tk.created_at)}</span>
                              </div>
                            </div>
                            <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                              {t(`priority.${tk.priority}` as never)}
                            </Badge>
                          </Link>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Unassigned in my groups */}
                <Card className="flex flex-col border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                    <div className="flex items-center gap-2">
                      <UsersIcon className="h-4 w-4 text-orange-500" />
                      <CardTitle className="text-base font-semibold">{t('dashboard.group_unassigned')}</CardTitle>
                    </div>
                    <Link to="/tickets">
                      <Button variant="ghost" size="sm" className="text-xs text-blue-600 dark:text-[#faff69]">
                        {t('common.view_all')}
                      </Button>
                    </Link>
                  </CardHeader>
                  <CardContent className="flex-1 px-0 pb-0">
                    <div className="divide-y divide-gray-100 dark:divide-[#1a1a1a]">
                      {summary?.unassigned_group_tickets.length === 0 ? (
                        <p className="px-6 py-8 text-center text-sm text-gray-500">{t('dashboard.no_group_tickets')}</p>
                      ) : (
                        summary?.unassigned_group_tickets.map((tk) => (
                          <Link key={tk.id} to="/tickets/$id" params={{ id: tk.id }} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-[#111]">
                            <div className="min-w-0 flex-1 pr-4">
                              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{tk.subject}</p>
                              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                                <span className="font-mono text-[10px]">{tk.tracking_number}</span>
                                <span>•</span>
                                <span>{formatDate(tk.created_at)}</span>
                              </div>
                            </div>
                            {tk.sla && tk.sla.status === 'red' && (
                              <ClockIcon className="h-4 w-4 shrink-0 text-red-500 animate-pulse" />
                            )}
                          </Link>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}

        <div className="flex gap-4">
          <Link to="/tickets">
            <Button variant="outline" className="border-gray-200 dark:border-[#2a2a2a] dark:text-white">
              {t('dashboard.view_all')}
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  )
}

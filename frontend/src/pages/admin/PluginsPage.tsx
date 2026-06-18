import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listPlugins, updatePlugin, uninstallPlugin } from '@/api/admin'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { PuzzleIcon, Trash2Icon } from 'lucide-react'
import type { Plugin } from '@/api/types'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

export function PluginsPage() {
  const { t } = useT()
  const qc = useQueryClient()
  const [pendingUninstall, setPendingUninstall] = useState<Plugin | null>(null)

  const { data: plugins = [], isLoading } = useQuery({
    queryKey: ['admin', 'plugins'],
    queryFn: listPlugins,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updatePlugin(id, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plugins'] })
    },
  })

  const uninstallMutation = useMutation({
    mutationFn: (id: string) => uninstallPlugin(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plugins'] })
      setPendingUninstall(null)
    },
  })

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('plugins.title')}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('plugins.subtitle')}
            </p>
          </div>
        </div>

        {/* List of plugins */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[#121212] text-xs text-gray-500 dark:text-gray-400 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">{t('plugins.table.info')}</th>
                  <th className="px-4 py-3 text-left">{t('plugins.table.runtime')}</th>
                  <th className="px-4 py-3 text-left">{t('plugins.table.hooks')}</th>
                  <th className="px-4 py-3 text-left">{t('plugins.table.status')}</th>
                  <th className="px-4 py-3 text-right">{t('plugins.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#1a1a1a]">
                {plugins.map((p) => (
                  <tr key={p.manifest.id} className={cn(!p.enabled && 'opacity-60', 'hover:bg-gray-50/50 dark:hover:bg-[#121212]/50 transition-colors')}>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <PuzzleIcon className="mt-1 h-5 w-5 text-gray-400 dark:text-gray-500 shrink-0" />
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            {p.manifest.name}
                            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">v{p.manifest.version}</span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{p.manifest.id}</div>
                          {p.manifest.description && (
                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{p.manifest.description}</p>
                          )}
                          {p.manifest.author && (
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">By {p.manifest.author}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={p.manifest.runtime === 'native' ? 'secondary' : 'outline'}>
                        {p.manifest.runtime}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {p.manifest.hooks.map((h) => (
                          <Badge key={h} variant="outline" className="text-[10px] font-mono px-1 py-0 bg-gray-50 dark:bg-[#1a1a1a] text-gray-800 dark:text-gray-200 border-gray-200 dark:border-[#2a2a2a]">
                            {h}
                          </Badge>
                        ))}
                        {p.manifest.hooks.length === 0 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">{t('plugins.table.none')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={p.enabled ? 'default' : 'secondary'}>
                        {p.enabled ? t('plugins.status.enabled') : t('plugins.status.disabled')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleMutation.mutate({ id: p.manifest.id, enabled: !p.enabled })}
                          disabled={toggleMutation.isPending}
                        >
                          {p.enabled ? t('plugins.action.disable') : t('plugins.action.enable')}
                        </Button>
                        {p.manifest.runtime === 'wasm' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-950/50 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 dark:hover:text-red-300"
                            onClick={() => setPendingUninstall(p)}
                            disabled={uninstallMutation.isPending}
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {plugins.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      {t('plugins.list.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingUninstall !== null}
        onOpenChange={(open) => { if (!open) setPendingUninstall(null) }}
        title={t('plugins.delete.confirm_title').replace('{name}', pendingUninstall?.manifest.name ?? '')}
        description={t('plugins.delete.confirm_desc')}
        confirmLabel={t('plugins.delete.confirm_action')}
        isPending={uninstallMutation.isPending}
        onConfirm={() => { if (pendingUninstall) uninstallMutation.mutate(pendingUninstall.manifest.id) }}
      />
    </Layout>
  )
}

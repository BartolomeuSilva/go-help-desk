import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listStatuses, createStatus, updateStatus, deleteStatus } from '@/api/admin'
import type { Status } from '@/api/types'
import { extractError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { PlusIcon, LockIcon } from 'lucide-react'
import { useT } from '@/i18n'

const DEFAULT_COLOR = '#6b7280'

export function StatusesPage() {
  const { t } = useT()
  const qc = useQueryClient()
  const [addingStatus, setAddingStatus] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Status | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [sortOrder, setSortOrder] = useState(10)
  const [formError, setFormError] = useState('')

  const { data: statuses = [], isLoading } = useQuery({
    queryKey: ['admin', 'statuses'],
    queryFn: listStatuses,
  })

  const createMutation = useMutation({
    mutationFn: () => createStatus({ name: name.trim(), color, sort_order: sortOrder }),
    onSuccess: () => {
      setName('')
      setColor(DEFAULT_COLOR)
      setSortOrder(10)
      setAddingStatus(false)
      setFormError('')
      qc.invalidateQueries({ queryKey: ['admin', 'statuses'] })
    },
    onError: (err) => setFormError(extractError(err)),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => updateStatus(id, { active: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'statuses'] }),
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => updateStatus(id, { active: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'statuses'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStatus(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'statuses'] })
      setPendingDelete(null)
    },
  })

  const sorted = [...statuses].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('statuses.title')}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('statuses.subtitle')}
            </p>
          </div>
          <Button onClick={() => setAddingStatus(true)} className="ml-6 shrink-0">
            <PlusIcon className="mr-2 h-4 w-4" />
            {t('statuses.new_status')}
          </Button>
        </div>

        {addingStatus && (
          <div className="rounded-lg border bg-white p-4">
            <p className="mb-3 text-sm font-medium text-gray-700">{t('statuses.form.new_title')}</p>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('statuses.form.name')}</label>
                <Input
                  autoFocus
                  placeholder={t('statuses.form.name_placeholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && name.trim()) createMutation.mutate()
                    if (e.key === 'Escape') { setAddingStatus(false); setName('') }
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('statuses.form.color')}</label>
                <div className="flex items-center gap-2 h-9">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border border-gray-300 p-1"
                  />
                  <span className="font-mono text-sm text-gray-500">{color}</span>
                </div>
              </div>
              <div className="w-28 space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('statuses.form.sort_order')}</label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!name.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? t('statuses.form.adding') : t('statuses.form.add')}
                </Button>
                <Button variant="outline" onClick={() => { setAddingStatus(false); setName('') }}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
            {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-10 px-4 py-3 text-left">{t('statuses.table.color')}</th>
                  <th className="px-4 py-3 text-left">{t('statuses.table.name')}</th>
                  <th className="px-4 py-3 text-left">{t('statuses.table.type')}</th>
                  <th className="w-24 px-4 py-3 text-left">{t('statuses.table.sort_order')}</th>
                  <th className="px-4 py-3 text-left">{t('statuses.table.tickets')}</th>
                  <th className="px-4 py-3 text-right">{t('statuses.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((s) => (
                  <tr key={s.id} className={`group hover:bg-gray-50 ${!s.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block h-4 w-4 rounded-full border border-black/10 shadow-sm"
                        style={{ backgroundColor: s.color || DEFAULT_COLOR }}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {s.name}
                      {!s.active && (
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-500">
                          {t('statuses.badge.inactive')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={s.kind === 'system' ? 'secondary' : 'outline'}>
                        {s.kind === 'system' ? t('statuses.kind.system') : t('statuses.kind.custom')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{s.sort_order}</td>
                    <td className="px-4 py-3 text-gray-500">{s.ticket_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {s.kind === 'system' ? (
                          <span title={t('statuses.tooltips.system')} className="flex justify-end">
                            <LockIcon className="h-3.5 w-3.5 text-gray-300" />
                          </span>
                        ) : s.active ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-yellow-700 border-yellow-300 hover:bg-yellow-50"
                            onClick={() => deactivateMutation.mutate(s.id)}
                            disabled={deactivateMutation.isPending}
                          >
                            {t('statuses.actions.deactivate')}
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-700 border-green-300 hover:bg-green-50"
                              onClick={() => reactivateMutation.mutate(s.id)}
                              disabled={reactivateMutation.isPending}
                            >
                              {t('statuses.actions.reactivate')}
                            </Button>
                            {s.ticket_count === 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-200 hover:bg-red-50"
                                onClick={() => setPendingDelete(s)}
                                disabled={deleteMutation.isPending}
                              >
                                {t('statuses.actions.delete')}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                      {t('statuses.list.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={t('statuses.delete.confirm_title').replace('{name}', pendingDelete?.name ?? '')}
        description={t('statuses.delete.confirm_desc')}
        confirmLabel={t('statuses.delete.confirm_action')}
        isPending={deleteMutation.isPending}
        onConfirm={() => { if (pendingDelete) deleteMutation.mutate(pendingDelete.id) }}
      />
    </Layout>
  )
}


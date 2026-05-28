import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listAllTags, createTag, deleteTag, restoreTag } from '@/api/admin'
import { extractError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { PlusIcon } from 'lucide-react'
import type { Tag } from '@/api/types'
import { useT } from '@/i18n'

export function TagsPage() {
  const { t } = useT()
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null)

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['admin', 'tags'],
    queryFn: listAllTags,
  })

  const createMutation = useMutation({
    mutationFn: () => createTag(newName.trim()),
    onSuccess: () => {
      setNewName('')
      setCreateError('')
      qc.invalidateQueries({ queryKey: ['admin', 'tags'] })
    },
    onError: (err) => setCreateError(extractError(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'tags'] })
      setPendingDelete(null)
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreTag(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tags'] }),
  })

  function isDeleted(t: Tag) {
    return !!t.deleted_at
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('tags.title')}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('tags.subtitle')}
            </p>
          </div>
        </div>

        {/* Create tag form */}
        <div className="rounded-lg border bg-white p-4">
          <p className="mb-3 text-sm font-medium text-gray-700">{t('tags.form.new_title')}</p>
          <div className="flex items-center gap-3">
            <Input
              placeholder={t('tags.form.name_placeholder')}
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setCreateError('') }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) createMutation.mutate()
              }}
              className="max-w-xs"
            />
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || createMutation.isPending}
            >
              <PlusIcon className="mr-2 h-4 w-4" />
              {createMutation.isPending ? t('tags.form.adding') : t('tags.form.add')}
            </Button>
          </div>
          {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">{t('tags.table.name')}</th>
                  <th className="px-4 py-3 text-left">{t('tags.table.status')}</th>
                  <th className="px-4 py-3 text-left">{t('tags.table.created')}</th>
                  <th className="px-4 py-3 text-right">{t('tags.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tags.map((tTag) => (
                  <tr key={tTag.id} className={isDeleted(tTag) ? 'opacity-50' : ''}>
                    <td className="px-4 py-3 font-medium text-gray-900">{tTag.name}</td>
                    <td className="px-4 py-3">
                      {isDeleted(tTag) ? (
                        <Badge variant="secondary">{t('tags.badge.deactivated')}</Badge>
                      ) : (
                        <Badge variant="default">{t('tags.badge.active')}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(tTag.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isDeleted(tTag) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-700 border-green-300 hover:bg-green-50"
                          onClick={() => restoreMutation.mutate(tTag.id)}
                          disabled={restoreMutation.isPending}
                        >
                          {t('tags.actions.restore')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => setPendingDelete(tTag)}
                          disabled={deleteMutation.isPending}
                        >
                          {t('tags.actions.deactivate')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {tags.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      {t('tags.list.empty')}
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
        title={t('tags.delete.confirm_title').replace('{name}', pendingDelete?.name ?? '')}
        description={t('tags.delete.confirm_desc')}
        confirmLabel={t('tags.actions.deactivate')}
        isPending={deleteMutation.isPending}
        onConfirm={() => { if (pendingDelete) deleteMutation.mutate(pendingDelete.id) }}
      />
    </Layout>
  )
}


import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listFieldDefs, createFieldDef, updateFieldDef } from '@/api/admin'
import { extractError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { PlusIcon } from 'lucide-react'
import type { FieldDef, FieldType } from '@/api/types'
import { useT } from '@/i18n'

const FIELD_TYPES: { value: FieldType; labelKey: string }[] = [
  { value: 'text', labelKey: 'custom_fields.types.text' },
  { value: 'textarea', labelKey: 'custom_fields.types.textarea' },
  { value: 'number', labelKey: 'custom_fields.types.number' },
  { value: 'select', labelKey: 'custom_fields.types.select' },
]

export function CustomFieldsPage() {
  const { t } = useT()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('text')
  const [optionsRaw, setOptionsRaw] = useState('') // comma-separated
  const [sortOrder, setSortOrder] = useState(0)
  const [formError, setFormError] = useState('')

  const { data: defs = [], isLoading } = useQuery({
    queryKey: ['admin', 'custom-fields'],
    queryFn: listFieldDefs,
  })

  const createMutation = useMutation({
    mutationFn: () => {
      const options = fieldType === 'select'
        ? optionsRaw.split(',').map(s => s.trim()).filter(Boolean)
        : undefined
      return createFieldDef({ name: name.trim(), field_type: fieldType, options, sort_order: sortOrder })
    },
    onSuccess: () => {
      resetForm()
      qc.invalidateQueries({ queryKey: ['admin', 'custom-fields'] })
    },
    onError: (err) => setFormError(extractError(err)),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => updateFieldDef(id, { active: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'custom-fields'] }),
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => updateFieldDef(id, { active: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'custom-fields'] }),
  })

  function resetForm() {
    setName('')
    setFieldType('text')
    setOptionsRaw('')
    setSortOrder(0)
    setFormError('')
    setAdding(false)
  }

  function labelForType(ft: FieldType) {
    const key = FIELD_TYPES.find(tType => tType.value === ft)?.labelKey
    return key ? t(key as any) : ft
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('custom_fields.title')}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('custom_fields.subtitle')}
            </p>
          </div>
          <Button onClick={() => setAdding(true)} className="ml-6 shrink-0">
            <PlusIcon className="mr-2 h-4 w-4" />
            {t('custom_fields.new_field')}
          </Button>
        </div>

        {adding && (
          <div className="rounded-lg border bg-white p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">{t('custom_fields.form.new_title')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('custom_fields.form.name')}</label>
                <Input
                  autoFocus
                  placeholder={t('custom_fields.form.name_placeholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') resetForm() }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('custom_fields.form.type')}</label>
                <select
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value as FieldType)}
                >
                  {FIELD_TYPES.map(tType => (
                    <option key={tType.value} value={tType.value}>{t(tType.labelKey as any)}</option>
                  ))}
                </select>
              </div>
            </div>
            {fieldType === 'select' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {t('custom_fields.form.options')}
                </label>
                <Input
                  placeholder={t('custom_fields.form.options_placeholder')}
                  value={optionsRaw}
                  onChange={(e) => setOptionsRaw(e.target.value)}
                />
              </div>
            )}
            <div className="w-36 space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('custom_fields.form.sort_order')}</label>
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
                {createMutation.isPending ? t('custom_fields.form.adding') : t('custom_fields.form.add')}
              </Button>
              <Button variant="outline" onClick={resetForm}>{t('common.cancel')}</Button>
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">{t('custom_fields.table.name')}</th>
                  <th className="px-4 py-3 text-left">{t('custom_fields.table.type')}</th>
                  <th className="px-4 py-3 text-left">{t('custom_fields.table.options')}</th>
                  <th className="w-24 px-4 py-3 text-left">{t('custom_fields.table.sort')}</th>
                  <th className="px-4 py-3 text-left">{t('custom_fields.table.status')}</th>
                  <th className="px-4 py-3 text-right">{t('custom_fields.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {defs.map((def: FieldDef) => (
                  <tr key={def.id} className={`group hover:bg-gray-50 ${!def.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{def.name}</td>
                    <td className="px-4 py-3 text-gray-600">{labelForType(def.field_type)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {def.field_type === 'select' && def.options?.length
                        ? def.options.join(', ')
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{def.sort_order}</td>
                    <td className="px-4 py-3">
                      <Badge variant={def.active ? 'default' : 'secondary'}>
                        {def.active ? t('custom_fields.badge.active') : t('custom_fields.badge.inactive')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {def.active ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-yellow-700 border-yellow-300 hover:bg-yellow-50"
                            onClick={() => deactivateMutation.mutate(def.id)}
                            disabled={deactivateMutation.isPending}
                          >
                            {t('custom_fields.actions.deactivate')}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-700 border-green-300 hover:bg-green-50"
                            onClick={() => reactivateMutation.mutate(def.id)}
                            disabled={reactivateMutation.isPending}
                          >
                            {t('custom_fields.actions.reactivate')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {defs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                      {t('custom_fields.list.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}


import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  createTicket,
  listPublicCategories,
  listPublicTypes,
  resolveFieldsForCTI,
  uploadAttachment,
  getITSMDefault,
} from '@/api/tickets'
import { listCategories, listTypes, listItems, getSiteConfig } from '@/api/admin'
import { extractError } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { useT } from '@/i18n'
import { Layout } from '@/components/Layout'
import { AttachmentUpload, type UploadState } from '@/components/AttachmentUpload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Assignment } from '@/api/types'

function CustomFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: Assignment
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const def = field.field_def!
  const id = `cf-${field.id}`
  switch (def.field_type) {
    case 'textarea':
      return (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
        />
      )
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )
    case 'select':
      return (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          <option value="">Select…</option>
          {(def.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </Select>
      )
    default:
      return (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )
  }
}

export function NewTicketPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { t } = useT()
  const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin'

  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [itemId, setItemId] = useState('')
  const [priority, setPriority] = useState<'medium' | 'critical' | 'high' | 'low'>('medium')
  const [ticketType, setTicketType] = useState('')
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<File[]>([])
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState> | undefined>()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null)

  const { data: siteConfig } = useQuery({
    queryKey: ['site-config'],
    queryFn: getSiteConfig,
  })
  const itsmEnabled = Boolean(siteConfig?.itsm_enabled)

  // Staff/admin use the admin endpoints (all categories/types/items, active or inactive).
  // Regular users use the public endpoints (active only, no items).
  const { data: categories = [] } = useQuery({
    queryKey: isStaffOrAdmin ? ['admin-categories'] : ['public-categories'],
    queryFn: isStaffOrAdmin ? listCategories : listPublicCategories,
  })

  const { data: types = [] } = useQuery({
    queryKey: isStaffOrAdmin
      ? ['admin-types', categoryId]
      : ['public-types', categoryId],
    queryFn: () =>
      isStaffOrAdmin ? listTypes(categoryId) : listPublicTypes(categoryId),
    enabled: !!categoryId,
  })

  const { data: items = [] } = useQuery({
    queryKey: ['admin-items', categoryId, typeId],
    queryFn: () => listItems(categoryId, typeId),
    enabled: isStaffOrAdmin && !!categoryId && !!typeId,
  })

  const { data: ctiFields = [] } = useQuery({
    queryKey: ['ctiFields', categoryId, typeId, itemId],
    queryFn: () => resolveFieldsForCTI({
      category_id: categoryId,
      type_id: typeId || undefined,
      item_id: (isStaffOrAdmin && itemId) ? itemId : undefined,
    }),
    enabled: !!categoryId,
  })
  const visibleFields = ctiFields.filter((f) => f.visible_on_new)

  // Fetch default ticket type when CTI changes
  const { data: defaultTicketType } = useQuery({
    queryKey: ['itsm-default', categoryId, typeId, itemId],
    queryFn: () => getITSMDefault({
      category_id: categoryId,
      type_id: typeId || undefined,
      item_id: itemId || undefined,
    }),
    enabled: itsmEnabled && !!categoryId,
  })

  // Update ticketType state when defaultTicketType is fetched
  useEffect(() => {
    if (defaultTicketType) {
      setTicketType(defaultTicketType)
    } else {
      setTicketType('')
    }
  }, [defaultTicketType])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!subject.trim()) { setError('Subject is required'); return }
    if (!categoryId) { setError('Category is required'); return }

    // Validate required custom fields.
    for (const f of visibleFields) {
      if (f.required_on_new && !customFieldValues[f.field_def_id]) {
        setError(`${f.field_def?.name ?? 'A required field'} is required`)
        return
      }
    }

    setSubmitting(true)
    try {
      const t = await createTicket({
        subject,
        description,
        category_id: categoryId,
        type_id: typeId || undefined,
        item_id: isStaffOrAdmin ? (itemId || undefined) : undefined,
        priority: priority,
        ticket_type: (isStaffOrAdmin && itsmEnabled) ? (ticketType || undefined) : undefined,
        custom_fields: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      })

      if (files.length === 0) {
        navigate({ to: '/tickets/$id', params: { id: t.id } })
        return
      }

      // Upload attachments one by one.
      setCreatedTicketId(t.id)
      const initial: Record<string, UploadState> = {}
      for (const f of files) initial[f.name] = { status: 'pending' }
      setUploadStates(initial)

      let allOk = true
      for (const f of files) {
        setUploadStates((prev) => ({ ...prev!, [f.name]: { status: 'uploading' } }))
        try {
          await uploadAttachment(t.id, f)
          setUploadStates((prev) => ({ ...prev!, [f.name]: { status: 'done' } }))
        } catch (err) {
          allOk = false
          setUploadStates((prev) => ({
            ...prev!,
            [f.name]: { status: 'error', error: extractError(err) },
          }))
        }
      }

      if (allOk) {
        navigate({ to: '/tickets/$id', params: { id: t.id } })
      }
      // If some uploads failed, stay on page so the user sees errors.
      // They can still navigate via the "View ticket" link shown below.
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const isUploading = !!uploadStates
  const uploadDone = isUploading && Object.values(uploadStates!).every((s) => s.status !== 'uploading')

  return (
    <Layout>
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('ticket.new_title')}</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('ticket.details_card')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1 md:col-span-3">
                  <Label htmlFor="subject">{t('ticket.subject')} *</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t('ticket.subject_placeholder')}
                    disabled={isUploading}
                    required
                  />
                </div>

                <div className="space-y-1 md:col-span-1">
                  <Label htmlFor="priority">{t('ticket.priority')} *</Label>
                  <Select
                    id="priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    disabled={isUploading}
                    required
                  >
                    <option value="low">{t('ticket.priority_low')}</option>
                    <option value="medium">{t('ticket.priority_medium')}</option>
                    <option value="high">{t('ticket.priority_high')}</option>
                    {isStaffOrAdmin && <option value="critical">{t('ticket.priority_critical')}</option>}
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="description">{t('ticket.description')}</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('ticket.description_placeholder')}
                  rows={5}
                  disabled={isUploading}
                />
              </div>

              <div className={`grid gap-4 ${isStaffOrAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className="space-y-1">
                  <Label htmlFor="category">{t('ticket.category')} *</Label>
                  <Select
                    id="category"
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value)
                      setTypeId('')
                      setItemId('')
                      setCustomFieldValues({})
                    }}
                    disabled={isUploading}
                  >
                    <option value="">{t('ticket.select_placeholder')}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="type">{t('ticket.type')}</Label>
                  <Select
                    id="type"
                    value={typeId}
                    onChange={(e) => {
                      setTypeId(e.target.value)
                      setItemId('')
                      setCustomFieldValues({})
                    }}
                    disabled={isUploading || !categoryId || types.length === 0}
                  >
                    <option value="">{t('ticket.select_placeholder')}</option>
                    {types.map((tp) => (
                      <option key={tp.id} value={tp.id}>{tp.name}</option>
                    ))}
                  </Select>
                </div>

                {isStaffOrAdmin && (
                  <div className="space-y-1">
                    <Label htmlFor="item">{t('ticket.item')}</Label>
                    <Select
                      id="item"
                      value={itemId}
                      onChange={(e) => { setItemId(e.target.value); setCustomFieldValues({}) }}
                      disabled={isUploading || !typeId || items.length === 0}
                    >
                      <option value="">{t('ticket.select_placeholder')}</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>

              {isStaffOrAdmin && itsmEnabled && (
                <div className="flex gap-4">
                  <div className="space-y-1 w-full max-w-xs">
                    <Label htmlFor="ticketType">{t('ticket.ticket_type')}</Label>
                    <Select
                      id="ticketType"
                      value={ticketType}
                      onChange={(e) => setTicketType(e.target.value)}
                      disabled={isUploading}
                    >
                      <option value="">{t('itsm.select_type')}</option>
                      <option value="incident">{t('itsm.incident')}</option>
                      <option value="service_request">{t('itsm.service_request')}</option>
                      <option value="problem">{t('itsm.problem')}</option>
                      <option value="change_request">{t('itsm.change_request')}</option>
                    </Select>
                  </div>
                </div>
              )}

              {visibleFields.length > 0 && (
                <div className="space-y-4">
                  <div className="border-t border-gray-100" />
                  {visibleFields.map((f) => (
                    <div key={f.id} className="space-y-1">
                      <Label htmlFor={`cf-${f.id}`}>
                        {f.field_def?.name}
                        {f.required_on_new && <span className="ml-0.5 text-red-500"> *</span>}
                      </Label>
                      <CustomFieldInput
                        field={f}
                        value={customFieldValues[f.field_def_id] ?? ''}
                        onChange={(v) =>
                          setCustomFieldValues((prev) => ({ ...prev, [f.field_def_id]: v }))
                        }
                        disabled={isUploading}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1">
                <Label>{t('ticket.attachments')}</Label>
                <AttachmentUpload
                  files={files}
                  onChange={setFiles}
                  uploadStates={uploadStates}
                  disabled={isUploading}
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              {uploadDone && createdTicketId && (
                <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm space-y-1">
                  <p className="text-yellow-800 font-medium">{t('ticket.upload_failed')}</p>
                  <button
                    type="button"
                    className="text-blue-600 underline hover:no-underline"
                    onClick={() => navigate({ to: '/tickets/$id', params: { id: createdTicketId } })}
                  >
                    {t('ticket.view_anyway')}
                  </button>
                </div>
              )}

              {!uploadDone && (
                <div className="flex gap-3">
                  <Button type="submit" disabled={submitting || isUploading}>
                    {submitting
                      ? t('ticket.submitting')
                      : isUploading
                      ? t('ticket.uploading')
                      : t('ticket.submit')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate({ to: '/tickets' })}
                    disabled={submitting || isUploading}
                  >
                    {t('ticket.cancel')}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}

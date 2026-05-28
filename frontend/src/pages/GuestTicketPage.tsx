import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createTicket, listPublicCategories, resolveFieldsForCTI } from '@/api/tickets'
import { extractError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Assignment } from '@/api/types'
import { useT } from '@/i18n'


interface SuccessInfo {
  trackingNumber: string
}

function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: Assignment
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useT()
  const def = field.field_def!
  const id = `cf-${field.id}`
  switch (def.field_type) {
    case 'textarea':
      return (
        <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
      )
    case 'number':
      return (
        <Input id={id} type="number" value={value} onChange={(e) => onChange(e.target.value)} />
      )
    case 'select':
      return (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('ticket.select_placeholder')}</option>
          {(def.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </Select>
      )
    default:
      return (
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      )
  }
}

export function GuestTicketPage() {
  const { t } = useT()
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<SuccessInfo | null>(null)

  const { data: categories = [] } = useQuery({
    queryKey: ['public-categories'],
    queryFn: listPublicCategories,
  })

  const { data: ctiFields = [] } = useQuery({
    queryKey: ['ctiFields-guest', categoryId],
    queryFn: () => resolveFieldsForCTI({ category_id: categoryId }),
    enabled: !!categoryId,
  })
  const visibleFields = ctiFields.filter((f) => f.visible_on_new)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!subject.trim()) { setError(t('guest.err_subject')); return }
    if (!categoryId) { setError(t('guest.err_category')); return }
    if (!name.trim()) { setError(t('guest.err_name')); return }
    if (!email.trim()) { setError(t('guest.err_email')); return }

    for (const f of visibleFields) {
      if (f.required_on_new && !customFieldValues[f.field_def_id]) {
        setError(`${f.field_def?.name ?? 'Field'} ${t('guest.err_required')}`)
        return
      }
    }

    setLoading(true)
    try {
      const t = await createTicket({
        subject,
        description,
        category_id: categoryId,
        priority: priority,
        guest_name: name.trim(),
        guest_email: email.trim(),
        guest_phone: phone.trim() || undefined,
        custom_fields: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      })
      setSuccess({ trackingNumber: t.tracking_number })
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-green-700">{t('guest.success_title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-700">
              <p>
                {t('guest.success_message')}
              </p>
              <p className="text-center text-2xl font-mono font-bold tracking-widest text-gray-900">
                {success.trackingNumber}
              </p>
              <p className="text-gray-500">
                {t('guest.success_instruction')}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setSuccess(null)
                  setSubject('')
                  setDescription('')
                  setCategoryId('')
                  setName('')
                  setEmail('')
                  setPhone('')
                  setCustomFieldValues({})
                }}
              >
                {t('guest.submit_another')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-12">
      <div className="max-w-lg w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('guest.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('guest.subtitle')}
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} method="POST" className="space-y-5">
              {/* Contact info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="name">{t('guest.name')}</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('guest.name_placeholder')}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email">{t('guest.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('guest.email_placeholder')}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="phone">{t('guest.phone')} <span className="text-gray-400 font-normal">{t('guest.optional')}</span></Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('guest.phone_placeholder')}
                />
              </div>

              <hr className="border-gray-100" />

              {/* Ticket details */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1 md:col-span-3">
                  <Label htmlFor="subject">{t('ticket.subject')} *</Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t('ticket.subject_placeholder')}
                    required
                  />
                </div>

                <div className="space-y-1 md:col-span-1">
                  <Label htmlFor="priority">{t('ticket.priority')} *</Label>
                  <Select
                    id="priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    required
                  >
                    <option value="low">{t('ticket.priority_low')}</option>
                    <option value="medium">{t('ticket.priority_medium')}</option>
                    <option value="high">{t('ticket.priority_high')}</option>
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
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="category">{t('ticket.category')} *</Label>
                <Select
                  id="category"
                  value={categoryId}
                  onChange={(e) => { setCategoryId(e.target.value); setCustomFieldValues({}) }}
                >
                  <option value="">{t('ticket.select_placeholder')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </div>

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
                      />
                    </div>
                  ))}
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('guest.submitting') : t('guest.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

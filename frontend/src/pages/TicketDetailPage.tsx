import React, { useState, useEffect } from 'react'
import { useParams } from '@tanstack/react-router'
import { useT } from '@/i18n'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTicket,
  listReplies,
  listStatusHistory,
  addReply,
  resolveTicket,
  reopenTicket,
  updateTicket,
  listAttachments,
  uploadAttachment,
  attachmentDownloadUrl,
  listTicketCustomFields,
  putTicketCustomFields,
  listPublicCategories,
  listPublicTypes,
  listPublicItems,
  rateTicket,
} from '@/api/tickets'
import { cn } from '@/lib/utils'
import { Star } from 'lucide-react'
import { TagInput } from '@/components/TagInput'
import { AttachmentUpload, type UploadState } from '@/components/AttachmentUpload'
import { listStatuses, listUsers, getSiteConfig } from '@/api/admin'
import { listCannedResponses } from '@/api/canned'
import { extractError } from '@/api/client'
import { useAuthStore } from '@/store/auth'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { api } from '@/api/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Group, User, StatusHistoryEntry, TicketFieldValue, Category, TicketType, TicketItem } from '@/api/types'

function priorityVariant(p: string) {
  if (p === 'critical') return 'destructive'
  if (p === 'high') return 'warning'
  if (p === 'medium') return 'default'
  return 'secondary'
}

function ticketTypeVariant(tt: string) {
  if (tt === 'incident') return 'destructive'
  if (tt === 'problem') return 'warning'
  if (tt === 'service_request') return 'default'
  return 'secondary'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}

// Fetches the shared /api/v1/groups list (accessible to staff+admin).
async function listGroupsShared(): Promise<Group[]> {
  const res = await api.get<Group[]>('/groups')
  return res.data
}

// ── Assignee panel ────────────────────────────────────────────────────────────

interface AssigneePanelProps {
  ticketId: string
  assigneeUserId?: string
  assigneeGroupId?: string
  users: User[]
  groups: Group[]
  onUpdated: () => void
}

function AssigneePanel({ ticketId, assigneeUserId, assigneeGroupId, users, groups, onUpdated }: AssigneePanelProps) {
  const { t } = useT()
  const [mode, setMode] = useState<'user' | 'group'>('user')
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState('')

  const assignMutation = useMutation({
    mutationFn: () => {
      if (mode === 'user') {
        return updateTicket(ticketId, { assignee_user_id: selectedId || undefined, assignee_group_id: undefined })
      } else {
        return updateTicket(ticketId, { assignee_group_id: selectedId || undefined, assignee_user_id: undefined })
      }
    },
    onSuccess: () => {
      setSelectedId('')
      setError('')
      onUpdated()
    },
    onError: (err) => setError(extractError(err)),
  })

  const unassignMutation = useMutation({
    mutationFn: () => updateTicket(ticketId, { assignee_user_id: undefined, assignee_group_id: undefined }),
    onSuccess: () => { setError(''); onUpdated() },
    onError: (err) => setError(extractError(err)),
  })

  const currentUser = users.find((u) => u.id === assigneeUserId)
  const currentGroup = groups.find((g) => g.id === assigneeGroupId)

  const staffUsers = users.filter((u) => u.role === 'staff' || u.role === 'admin')

  return (
    <div className="space-y-2">
      {/* Current assignee */}
      <div className="text-sm">
        {currentUser ? (
          <span className="font-medium">{currentUser.display_name}</span>
        ) : currentGroup ? (
          <span className="inline-flex items-center gap-1 font-medium">
            <span className="h-2 w-2 rounded-full bg-blue-400 dark:bg-[#faff69]" />
            {currentGroup.name}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-600">{t('tickets.detail.unassigned')}</span>
        )}
      </div>

      {/* Assignment controls */}
      <div className="flex gap-1 text-xs">
        <button
          className={`px-2 py-0.5 rounded ${mode === 'user' ? 'bg-blue-100 text-blue-700 dark:bg-[#1a1a1a] dark:text-[#faff69] font-medium' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white'}`}
          onClick={() => setMode('user')}
        >
          {t('tickets.detail.mode_user')}
        </button>
        <button
          className={`px-2 py-0.5 rounded ${mode === 'group' ? 'bg-blue-100 text-blue-700 dark:bg-[#1a1a1a] dark:text-[#faff69] font-medium' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white'}`}
          onClick={() => setMode('group')}
        >
          {t('tickets.detail.mode_group')}
        </button>
      </div>

      <div className="flex gap-2">
        <Select
          className="h-8 text-xs flex-1"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">{mode === 'user' ? t('tickets.detail.select_staff') : t('tickets.detail.select_group')}</option>
          {mode === 'user'
            ? staffUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.display_name}</option>
              ))
            : groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
        </Select>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={() => assignMutation.mutate()}
          disabled={!selectedId || assignMutation.isPending}
        >
          {t('tickets.detail.assign')}
        </Button>
      </div>

      {(assigneeUserId || assigneeGroupId) && (
        <button
          className="text-xs text-gray-400 hover:text-gray-600"
          onClick={() => unassignMutation.mutate()}
          disabled={unassignMutation.isPending}
        >
          {t('tickets.detail.clear_assignment')}
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ── Custom fields panel ───────────────────────────────────────────────────────

interface CustomFieldsPanelProps {
  ticketId: string
  isStaffOrAdmin: boolean
}

function CustomFieldsPanel({ ticketId, isStaffOrAdmin }: CustomFieldsPanelProps) {
  const { t } = useT()
  const qc = useQueryClient()
  const { data: values = [] } = useQuery<TicketFieldValue[]>({
    queryKey: ['customFields', ticketId],
    queryFn: () => listTicketCustomFields(ticketId),
  })

  const [editValues, setEditValues] = useState<Record<string, string> | null>(null)
  const [saveError, setSaveError] = useState('')

  const saveMutation = useMutation({
    mutationFn: () => putTicketCustomFields(ticketId, editValues!),
    onSuccess: () => {
      setEditValues(null)
      setSaveError('')
      qc.invalidateQueries({ queryKey: ['customFields', ticketId] })
    },
    onError: (err) => setSaveError(extractError(err)),
  })

  // Nothing to show if no values and not staff/admin (users only see populated values).
  if (values.length === 0 && !isStaffOrAdmin) return null
  if (values.length === 0) return null

  const displayValues = editValues
    ? values.map((v) => ({ ...v, value: editValues[v.field_def_id] ?? v.value }))
    : values

  function renderInput(v: TicketFieldValue) {
    const current = editValues?.[v.field_def_id] ?? v.value
    const onChange = (val: string) =>
      setEditValues((prev) => ({ ...(prev ?? {}), [v.field_def_id]: val }))

    switch (v.field_type) {
      case 'textarea':
        return (
          <Textarea
            value={current}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            className="text-xs"
          />
        )
      case 'number':
        return (
          <Input
            type="number"
            value={current}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 text-xs"
          />
        )
      case 'select':
        return (
          <Select
            value={current}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 text-xs"
          >
            <option value="">—</option>
            {(v.options ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </Select>
        )
      default:
        return (
          <Input
            value={current}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 text-xs"
          />
        )
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {t('tickets.detail.custom_fields')}
          </CardTitle>
          {isStaffOrAdmin && !editValues && (
            <button
              className="text-xs text-blue-600 dark:text-[#faff69] hover:underline"
              onClick={() => {
                const init: Record<string, string> = {}
                for (const v of values) init[v.field_def_id] = v.value
                setEditValues(init)
              }}
            >
              {t('tickets.detail.edit')}
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {displayValues.map((v) => (
          <div key={v.field_def_id} className="space-y-0.5">
            <Label className="text-xs text-gray-500 dark:text-gray-400">{v.field_name}</Label>
            {isStaffOrAdmin && editValues ? (
              renderInput(v)
            ) : (
              <p className="text-sm">{v.value || <span className="text-gray-400 dark:text-gray-600">—</span>}</p>
            )}
          </div>
        ))}
        {isStaffOrAdmin && editValues && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? t('tickets.detail.saving') : t('tickets.detail.save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => { setEditValues(null); setSaveError('') }}
            >
              {t('tickets.detail.cancel')}
            </Button>
          </div>
        )}
        {saveError && <p className="text-xs text-red-600">{saveError}</p>}
      </CardContent>
    </Card>
  )
}

function RatingForm({ ticketId }: { ticketId: string }) {
  const [rating, setRating] = useState<number>(0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  const qc = useQueryClient()

  const rateMutation = useMutation({
    mutationFn: () => rateTicket(ticketId, { rating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ticketId] })
    },
    onError: (err) => {
      setError(extractError(err))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (rating === 0) {
      setError('Por favor, selecione uma nota de 1 a 5 estrelas.')
      return
    }
    setError('')
    rateMutation.mutate()
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-white dark:text-white">
          Avalie o Atendimento
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className="focus:outline-none transition-colors"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
              >
                <Star
                  className={cn(
                    'h-6 w-6 cursor-pointer',
                    star <= (hoverRating || rating)
                      ? 'fill-[#faff69] text-[#faff69]'
                      : 'text-gray-400 dark:text-gray-600 hover:text-gray-300'
                  )}
                />
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-sm font-semibold text-white">
                {rating} / 5
              </span>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="rating-comment" className="text-xs text-gray-400">
              Comentário (opcional)
            </Label>
            <Textarea
              id="rating-comment"
              placeholder="Conte-nos como foi sua experiência..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="text-xs bg-background text-foreground border-input"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <Button
            type="submit"
            size="sm"
            className="w-full text-xs h-8"
            disabled={rateMutation.isPending}
          >
            {rateMutation.isPending ? 'Enviando...' : 'Enviar Avaliação'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function TicketDetailPage() {
  const { t, tStatus } = useT()
  const { id } = useParams({ from: '/tickets/$id' })
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const [replyBody, setReplyBody] = useState('')
  const [replyInternal, setReplyInternal] = useState(false)
  const [replyNotify, setReplyNotify] = useState(true)
  const [sendAgentName, setSendAgentName] = useState(() => {
    const stored = localStorage.getItem('gohd_send_agent_name')
    return stored === null ? true : stored === 'true'
  })
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [replyUploadStates, setReplyUploadStates] = useState<Record<string, UploadState> | undefined>()
  const [replyError, setReplyError] = useState('')

  const handleSendAgentNameChange = (checked: boolean) => {
    setSendAgentName(checked)
    localStorage.setItem('gohd_send_agent_name', String(checked))
  }
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [sseError, setSseError] = useState<string | null>(null)
  const [previewImageIndex, setPreviewImageIndex] = useState<number | null>(null)

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id),
  })

  const { data: siteConfig } = useQuery({
    queryKey: ['site-config'],
    queryFn: getSiteConfig,
  })
  const itsmEnabled = Boolean(siteConfig?.itsm_enabled)

  const [detailsEdit, setDetailsEdit] = useState(false)
  const [editTicketType, setEditTicketType] = useState('')
  const [detailsError, setDetailsError] = useState('')

  useEffect(() => {
    if (ticket) {
      setEditTicketType(ticket.ticket_type ?? '')
    }
  }, [ticket])

  const detailsMutation = useMutation({
    mutationFn: () => updateTicket(id, {
      ticket_type: editTicketType || undefined,
    }),
    onSuccess: () => {
      setDetailsEdit(false)
      setDetailsError('')
      qc.invalidateQueries({ queryKey: ['ticket', id] })
    },
    onError: (err) => setDetailsError(extractError(err)),
  })

  useEffect(() => {
    setSseStatus('connecting')
    setSseError(null)

    const eventSource = new EventSource(`/api/v1/tickets/${id}/events`, {
      withCredentials: true,
    })

    eventSource.onopen = () => {
      setSseStatus('connected')
      setSseError(null)
    }

    const handleRefresh = () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] })
      qc.invalidateQueries({ queryKey: ['replies', id] })
      qc.invalidateQueries({ queryKey: ['statusHistory', id] })
      qc.invalidateQueries({ queryKey: ['attachments', id] })
      qc.invalidateQueries({ queryKey: ['customFields', id] })
    };

    eventSource.addEventListener('refresh', handleRefresh)

    eventSource.onerror = (err) => {
      setSseStatus('error')
      setSseError(t('tickets.detail.sse_error'))
      console.error('SSE connection error:', err)
    }

    return () => {
      eventSource.removeEventListener('refresh', handleRefresh)
      eventSource.close()
    }
  }, [id, qc])



  const { data: replies = [] } = useQuery({
    queryKey: ['replies', id],
    queryFn: () => listReplies(id),
    enabled: !!ticket,
  })

  const { data: statusHistory = [] } = useQuery({
    queryKey: ['statusHistory', id],
    queryFn: () => listStatusHistory(id),
    enabled: !!ticket,
  })

  type TimelineItem =
    | { kind: 'reply'; ts: string; data: typeof replies[0] }
    | { kind: 'status'; ts: string; data: StatusHistoryEntry }

  const timeline: TimelineItem[] = [
    ...replies.map((r) => ({ kind: 'reply' as const, ts: r.created_at, data: r })),
    ...statusHistory.map((h) => ({ kind: 'status' as const, ts: h.created_at, data: h })),
  ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

  const { data: statuses = [] } = useQuery({
    queryKey: ['statuses'],
    queryFn: listStatuses,
  })

  const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin'

  // ── CTI state ────────────────────────────────────────────────────────────────
  const [ctiEdit, setCtiEdit] = useState(false)
  const [ctiCategoryId, setCtiCategoryId] = useState('')
  const [ctiTypeId, setCtiTypeId] = useState('')
  const [ctiItemId, setCtiItemId] = useState('')
  const [ctiError, setCtiError] = useState('')

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['public-categories'],
    queryFn: listPublicCategories,
  })

  const { data: ctiTypes = [] } = useQuery<TicketType[]>({
    queryKey: ['public-types', ctiCategoryId || ticket?.category_id],
    queryFn: () => listPublicTypes(ctiCategoryId || ticket!.category_id),
    enabled: !!(ctiCategoryId || ticket?.category_id),
  })

  const activeCtiTypeId = ctiTypeId || ticket?.type_id || ''
  const { data: ctiItems = [] } = useQuery<TicketItem[]>({
    queryKey: ['public-items', ctiCategoryId || ticket?.category_id, activeCtiTypeId],
    queryFn: () => listPublicItems(ctiCategoryId || ticket!.category_id, activeCtiTypeId),
    enabled: !!activeCtiTypeId,
  })

  const ctiMutation = useMutation({
    mutationFn: () => updateTicket(id, {
      category_id: ctiCategoryId || ticket!.category_id,
      type_id: ctiTypeId || null,
      item_id: ctiItemId || null,
    }),
    onSuccess: () => {
      setCtiEdit(false)
      setCtiError('')
      qc.invalidateQueries({ queryKey: ['ticket', id] })
    },
    onError: (err) => setCtiError(extractError(err)),
  })

  function startCtiEdit() {
    setCtiCategoryId(ticket?.category_id ?? '')
    setCtiTypeId(ticket?.type_id ?? '')
    setCtiItemId(ticket?.item_id ?? '')
    setCtiError('')
    setCtiEdit(true)
  }

  const categoryName = categories.find((c) => c.id === ticket?.category_id)?.name
  const typeName = ctiTypes.find((t) => t.id === ticket?.type_id)?.name
  const itemName = ctiItems.find((i) => i.id === ticket?.item_id)?.name

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers(),
    enabled: isStaffOrAdmin,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups-shared'],
    queryFn: listGroupsShared,
    enabled: isStaffOrAdmin,
  })

  const { data: cannedResponses = [] } = useQuery({
    queryKey: ['canned-responses'],
    queryFn: listCannedResponses,
    enabled: isStaffOrAdmin,
  })

  const { data: attachments = [] } = useQuery({
    queryKey: ['attachments', id],
    queryFn: () => listAttachments(id),
    enabled: !!ticket,
  })

  const imageAttachments = attachments.filter((a) => {
    return a.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(a.filename)
  })

  useEffect(() => {
    if (previewImageIndex === null) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewImageIndex(null)
      } else if (e.key === 'ArrowRight' && imageAttachments.length > 1) {
        setPreviewImageIndex((prev) => (prev !== null ? (prev + 1) % imageAttachments.length : null))
      } else if (e.key === 'ArrowLeft' && imageAttachments.length > 1) {
        setPreviewImageIndex((prev) => (prev !== null ? (prev - 1 + imageAttachments.length) % imageAttachments.length : null))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewImageIndex, imageAttachments.length])

  const statusName = statuses.find((s) => s.id === ticket?.status_id)?.name ?? '…'
  const statusColor = statuses.find((s) => s.id === ticket?.status_id)?.color

  const replyMutation = useMutation({
    mutationFn: () => addReply(id, replyBody, replyInternal, replyNotify, sendAgentName),
    onSuccess: async () => {
      setReplyBody('')
      setReplyError('')
      qc.invalidateQueries({ queryKey: ['replies', id] })
      qc.invalidateQueries({ queryKey: ['statusHistory', id] })
      qc.invalidateQueries({ queryKey: ['ticket', id] })

      // Upload any attached files to the ticket.
      if (replyFiles.length > 0) {
        const initial: Record<string, UploadState> = {}
        for (const f of replyFiles) initial[f.name] = { status: 'pending' }
        setReplyUploadStates(initial)

        for (const f of replyFiles) {
          setReplyUploadStates((prev) => ({ ...prev!, [f.name]: { status: 'uploading' } }))
          try {
            await uploadAttachment(id, f)
            setReplyUploadStates((prev) => ({ ...prev!, [f.name]: { status: 'done' } }))
          } catch (err) {
            setReplyUploadStates((prev) => ({
              ...prev!,
              [f.name]: { status: 'error', error: extractError(err) },
            }))
          }
        }

        qc.invalidateQueries({ queryKey: ['attachments', id] })
        // Clear files after a short delay so the user can see the done states.
        setTimeout(() => {
          setReplyFiles([])
          setReplyUploadStates(undefined)
        }, 1500)
      }
    },
    onError: (err) => setReplyError(extractError(err)),
  })

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!replyMutation.isPending && !replyUploadStates && replyBody.trim()) {
        replyMutation.mutate()
      }
    }
  }

  const resolveMutation = useMutation({
    mutationFn: () => resolveTicket(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] })
      qc.invalidateQueries({ queryKey: ['statusHistory', id] })
    },
  })

  const reopenMutation = useMutation({
    mutationFn: () => reopenTicket(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] })
      qc.invalidateQueries({ queryKey: ['statusHistory', id] })
    },
  })

  if (isLoading) return <Layout><div className="flex justify-center py-12"><Spinner size="lg" /></div></Layout>
  if (error || !ticket) return <Layout><p className="text-red-600">{t('tickets.detail.not_found')}</p></Layout>

  const canResolve = isStaffOrAdmin && statusName !== 'Resolved' && statusName !== 'Closed'
  const canReopen = isStaffOrAdmin && (statusName === 'Resolved' || statusName === 'Closed')

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>{ticket.tracking_number}</span>
              <span>·</span>
              <span>{t('tickets.detail.opened_at')} {formatDate(ticket.created_at)}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {ticket.source === 'whatsapp' && (
                <svg className="h-6 w-6 text-[#25D366] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.965C16.788 1.978 14.32 1.95 12.008 1.95c-5.442 0-9.866 4.372-9.87 9.802 0 1.706.467 3.376 1.353 4.851L2.484 21.5l5.003-1.309zM18.66 14.86c-.36-.18-2.14-1.055-2.47-1.176-.33-.12-.57-.18-.81.18-.24.36-.93 1.176-1.14 1.416-.21.24-.42.27-.78.09-3.48-1.745-4.815-3.055-5.69-4.575-.24-.42-.03-.63.15-.84.162-.187.36-.42.54-.63.18-.21.24-.36.36-.6.12-.24.06-.45-.03-.63-.09-.18-.81-1.95-1.11-2.67-.3-.72-.6-1.11-.81-1.11-.21 0-.45-.03-.69-.03-.24 0-.63.09-.96.45-.33.36-1.26 1.23-1.26 3 .0 1.77 1.29 3.48 1.47 3.72.18.24 2.535 3.87 6.14 5.425 2.145.925 3.015 1.085 4.1.925.685-.1 2.14-.875 2.44-1.725.3-.85.3-1.58.21-1.725-.09-.15-.33-.24-.69-.42z"/>
                </svg>
              )}
              <span>{ticket.subject}</span>
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                style={{ borderColor: statusColor, color: statusColor }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                {tStatus(statusName)}
              </span>
              <Badge variant={priorityVariant(ticket.priority) as never}>
                {t(`ticket.priority_${ticket.priority}` as any)}
              </Badge>
              {sseStatus === 'connected' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {t('tickets.detail.sse_connected')}
                </span>
              )}
              {sseStatus === 'connecting' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {t('tickets.detail.sse_connecting')}
                </span>
              )}
              {sseStatus === 'error' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-rose-500 font-medium" title={sseError || undefined}>
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  {t('tickets.detail.sse_disconnected')}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            {canResolve && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => resolveMutation.mutate()}
                disabled={resolveMutation.isPending}
              >
                {t('tickets.detail.action_resolve')}
              </Button>
            )}
            {canReopen && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reopenMutation.mutate()}
                disabled={reopenMutation.isPending}
              >
                {t('tickets.detail.action_reopen')}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="md:col-span-2 space-y-6">
            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-gray-500 dark:text-gray-400">{t('tickets.detail.description')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">
                  {ticket.description || <span className="text-gray-400 dark:text-gray-600">{t('tickets.detail.no_description')}</span>}
                </p>
              </CardContent>
            </Card>

            {/* Timeline */}
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('tickets.detail.timeline')}</h2>
              {timeline.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('tickets.detail.no_activity')}</p>
              )}
              {timeline.map((item) => {
                if (item.kind === 'reply') {
                  const r = item.data
                  const isSupport = r.author_id && r.author_id !== ticket.reporter_user_id

                  // Resolve author display name: prefer server-supplied author_name,
                  // fall back to allUsers lookup (staff/admin), then truncated ID
                  const authorUser = allUsers.find((u) => u.id === r.author_id)
                  const authorLabel = r.author_name
                    ?? authorUser?.display_name
                    ?? (r.author_id ? r.author_id.slice(0, 8) + '…' : t('tickets.detail.timeline_customer'))

                  // Card style: left accent border + subtle background per author type
                  let cardClass: string
                  let accentClass: string
                  let badgeEl: React.ReactNode

                  let textClass: string

                  if (r.internal) {
                    cardClass = 'border border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-950/20'
                    accentClass = 'border-l-4 border-l-yellow-400 dark:border-l-yellow-500'
                    textClass = 'text-yellow-900 dark:text-yellow-100'
                    badgeEl = (
                      <span className="rounded bg-yellow-100 dark:bg-yellow-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-700 dark:text-yellow-300 uppercase tracking-wide">
                        {t('tickets.detail.timeline_internal')}
                      </span>
                    )
                  } else if (isSupport) {
                    cardClass = 'border border-[#e6e85e] bg-[#faff69] dark:border-[#b8ba00]/40 dark:bg-[#faff69]/10'
                    accentClass = 'border-l-4 border-l-[#b8ba00] dark:border-l-[#faff69]'
                    textClass = 'text-[#ffffff]'
                    badgeEl = (
                      <span className="rounded bg-black dark:bg-black px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase tracking-wide">
                        {t('tickets.detail.timeline_support')}
                      </span>
                    )
                  } else {
                    cardClass = 'border border-emerald-100 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-950/10'
                    accentClass = 'border-l-4 border-l-emerald-400 dark:border-l-emerald-500'
                    textClass = 'text-[#ffffff]'
                    badgeEl = (
                      <span className="rounded bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                        {t('tickets.detail.timeline_customer')}
                      </span>
                    )
                  }

                  return (
                    <div
                      key={r.id}
                      className={`rounded-lg p-4 text-sm ${cardClass} ${accentClass}`}
                    >
                      <div className={`mb-1.5 flex items-center justify-between text-xs ${textClass} opacity-80`}>
                        <span className="flex items-center gap-1.5">
                          <span className={`font-semibold truncate max-w-[180px] ${textClass}`}>{authorLabel}</span>
                          {badgeEl}
                        </span>
                        <span className="flex items-center gap-2 tabular-nums">
                          {formatDate(r.created_at)}
                        </span>
                      </div>
                      <p className={`whitespace-pre-wrap ${textClass}`}>{r.body}</p>
                    </div>
                  )
                }
                // Status history event
                const h = item.data
                return (
                  <div key={h.id} className="flex items-center gap-3 py-1 text-xs text-gray-400 dark:text-gray-500">
                    <div className="flex-1 border-t border-gray-100 dark:border-[#2a2a2a]" />
                    <span className="shrink-0 text-center">
                      {h.from_status_id ? (
                        <>
                          <span style={{ color: h.from_status_color || undefined }} className="font-medium">
                            {tStatus(h.from_status_name)}
                          </span>
                          {' → '}
                          <span style={{ color: h.to_status_color || undefined }} className="font-medium">
                            {tStatus(h.to_status_name)}
                          </span>
                          {h.changed_by_name ? ` · ${h.changed_by_name}` : ` · ${t('tickets.detail.timeline_system')}`}
                        </>
                      ) : (
                        <>
                          {t('tickets.detail.timeline_opened_as')}{' '}
                          <span style={{ color: h.to_status_color || undefined }} className="font-medium">
                            {tStatus(h.to_status_name)}
                          </span>
                        </>
                      )}
                      {' · '}
                      {formatDate(h.created_at)}
                    </span>
                    <div className="flex-1 border-t border-gray-100 dark:border-[#2a2a2a]" />
                  </div>
                )
              })}
            </div>

            {/* Reply / work log form */}
            {statusName !== 'Closed' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {isStaffOrAdmin ? t('tickets.detail.reply_title_staff') : t('tickets.detail.reply_title')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isStaffOrAdmin && cannedResponses.length > 0 && (
                    <div className="flex items-center gap-2 mb-1 justify-end">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('tickets.detail.canned_response')}</span>
                      <select
                        className="h-8 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] px-2 py-1 text-xs text-gray-700 dark:text-gray-300 shadow-sm focus:border-blue-500 dark:focus:border-[#faff69] focus:outline-none"
                        onChange={(e) => {
                          const val = e.target.value
                          if (val) {
                            const canned = cannedResponses.find((cr) => cr.id === val)
                            if (canned) {
                              setReplyBody((prev) => {
                                const space = prev ? '\n\n' : ''
                                return prev + space + canned.content
                              })
                            }
                            e.target.value = '' // Reset
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="">{t('tickets.detail.canned_insert')}</option>
                        {cannedResponses.map((cr) => (
                          <option key={cr.id} value={cr.id}>
                            {cr.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <Textarea
                    placeholder={isStaffOrAdmin ? t('tickets.detail.reply_placeholder_staff') : t('tickets.detail.reply_placeholder')}
                    rows={4}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    disabled={!!replyUploadStates}
                    onKeyDown={handleKeyDown}
                  />

                  {isStaffOrAdmin && (
                    <>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={replyInternal}
                            onChange={(e) => {
                              setReplyInternal(e.target.checked)
                              if (e.target.checked) setReplyNotify(false)
                              else setReplyNotify(true)
                            }}
                            className="h-4 w-4 rounded border-gray-300"
                            disabled={!!replyUploadStates}
                          />
                          {t('tickets.detail.reply_internal')}
                        </label>

                        {!replyInternal && (
                          <>
                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={replyNotify}
                                onChange={(e) => setReplyNotify(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300"
                                disabled={!!replyUploadStates}
                              />
                              {t('tickets.detail.reply_notify')}
                            </label>

                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={sendAgentName}
                                onChange={(e) => handleSendAgentNameChange(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300"
                                disabled={!!replyUploadStates}
                              />
                              {t('tickets.detail.send_agent_name')}
                            </label>
                          </>
                        )}
                      </div>

                      <AttachmentUpload
                        files={replyFiles}
                        onChange={setReplyFiles}
                        uploadStates={replyUploadStates}
                        disabled={!!replyUploadStates}
                        maxFiles={5}
                      />
                    </>
                  )}

                  {replyError && <p className="text-sm text-red-600">{replyError}</p>}

                  <Button
                    onClick={() => replyMutation.mutate()}
                    disabled={replyMutation.isPending || !!replyUploadStates || !replyBody.trim()}
                  >
                    {replyMutation.isPending
                      ? t('tickets.detail.saving')
                      : replyUploadStates
                      ? t('tickets.detail.uploading')
                      : isStaffOrAdmin
                      ? t('tickets.detail.reply_submit_staff')
                      : t('tickets.detail.reply_submit')}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {ticket.source === 'whatsapp' && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-white dark:text-white flex items-center gap-1.5">
                    <svg className="h-4 w-4 text-[#25D366] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.965C16.788 1.978 14.32 1.95 12.008 1.95c-5.442 0-9.866 4.372-9.87 9.802 0 1.706.467 3.376 1.353 4.851L2.484 21.5l5.003-1.309zM18.66 14.86c-.36-.18-2.14-1.055-2.47-1.176-.33-.12-.57-.18-.81.18-.24.36-.93 1.176-1.14 1.416-.21.24-.42.27-.78.09-3.48-1.745-4.815-3.055-5.69-4.575-.24-.42-.03-.63.15-.84.162-.187.36-.42.54-.63.18-.21.24-.36.36-.6.12-.24.06-.45-.03-.63-.09-.18-.81-1.95-1.11-2.67-.3-.72-.6-1.11-.81-1.11-.21 0-.45-.03-.69-.03-.24 0-.63.09-.96.45-.33.36-1.26 1.23-1.26 3 .0 1.77 1.29 3.48 1.47 3.72.18.24 2.535 3.87 6.14 5.425 2.145.925 3.015 1.085 4.1.925.685-.1 2.14-.875 2.44-1.725.3-.85.3-1.58.21-1.725-.09-.15-.33-.24-.69-.42z"/>
                    </svg>
                    {t('tickets.detail.sidebar_whatsapp')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/70 dark:text-white/70">{t('tickets.detail.whatsapp_customer')}</span>
                    <span className="text-right text-xs text-white">{ticket.guest_name || 'WhatsApp User'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70 dark:text-white/70">{t('tickets.detail.whatsapp_phone')}</span>
                    <span className="text-right text-xs text-white font-mono">{ticket.whatsapp_phone || ticket.guest_phone || ''}</span>
                  </div>
                </CardContent>
              </Card>
            )}
            {isStaffOrAdmin && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-white dark:text-white">
                    {t('tickets.detail.sidebar_assignee')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AssigneePanel
                    ticketId={id}
                    assigneeUserId={ticket.assignee_user_id}
                    assigneeGroupId={ticket.assignee_group_id}
                    users={allUsers}
                    groups={groups}
                    onUpdated={() => qc.invalidateQueries({ queryKey: ['ticket', id] })}
                  />
                </CardContent>
              </Card>
            )}

            {ticket.sla && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-white dark:text-white">
                    {t('tickets.detail.sidebar_sla_status')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 dark:text-white/70">{t('tickets.list.header_status')}</span>
                    <span
                      className={
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ' +
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
                  </div>

                  {ticket.sla.response_deadline && (
                    <div className="flex justify-between flex-col gap-0.5 border-t border-gray-50 dark:border-[#2a2a2a] pt-2">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{t('tickets.detail.sla_response_deadline')}</span>
                      <span className="text-xs font-mono text-gray-900 dark:text-white">
                        {formatDate(ticket.sla.response_deadline)}
                      </span>
                    </div>
                  )}

                  {ticket.sla.first_response_at ? (
                    <div className="flex justify-between flex-col gap-0.5">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{t('tickets.detail.sla_responded_at')}</span>
                      <span className="text-xs font-mono text-green-600 dark:text-emerald-400">
                        {formatDate(ticket.sla.first_response_at)}
                      </span>
                    </div>
                  ) : ticket.sla.response_breached_at ? (
                    <div className="flex justify-between flex-col gap-0.5">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{t('tickets.detail.sla_response_breached')}</span>
                      <span className="text-xs font-mono text-red-600 dark:text-red-400">
                        {formatDate(ticket.sla.response_breached_at)}
                      </span>
                    </div>
                  ) : null}

                  {ticket.sla.resolution_deadline && (
                    <div className="flex justify-between flex-col gap-0.5 border-t border-gray-50 dark:border-[#2a2a2a] pt-2">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{t('tickets.detail.sla_resolution_deadline')}</span>
                      <span className="text-xs font-mono text-gray-900 dark:text-white">
                        {formatDate(ticket.sla.resolution_deadline)}
                      </span>
                    </div>
                  )}

                  {ticket.sla.resolved_at ? (
                    <div className="flex justify-between flex-col gap-0.5">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{t('tickets.detail.sla_resolved_at')}</span>
                      <span className="text-xs font-mono text-green-600 dark:text-emerald-400">
                        {formatDate(ticket.sla.resolved_at)}
                      </span>
                    </div>
                  ) : ticket.sla.resolution_breached_at ? (
                    <div className="flex justify-between flex-col gap-0.5">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">{t('tickets.detail.sla_resolution_breached')}</span>
                      <span className="text-xs font-mono text-red-600 dark:text-red-400">
                        {formatDate(ticket.sla.resolution_breached_at)}
                      </span>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}

            <CustomFieldsPanel ticketId={id} isStaffOrAdmin={isStaffOrAdmin} />

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-white dark:text-white">
                  {t('tickets.detail.sidebar_tags')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TagInput ticketId={id} readonly={!isStaffOrAdmin} />
              </CardContent>
            </Card>

            {attachments.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-white dark:text-white">
                    {t('tickets.detail.sidebar_attachments')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {attachments.map((a) => {
                    const isImage = a.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(a.filename)
                    const url = attachmentDownloadUrl(id, a.id)
                    return (
                      <a
                        key={a.id}
                        href={url}
                        className="flex items-center gap-2 text-sm text-blue-600 dark:text-[#faff69] hover:underline truncate cursor-pointer"
                        download={isImage ? undefined : a.filename}
                        onClick={(e) => {
                          if (isImage) {
                            e.preventDefault()
                            const imgIndex = imageAttachments.findIndex((img) => img.id === a.id)
                            if (imgIndex !== -1) {
                              setPreviewImageIndex(imgIndex)
                            }
                          }
                        }}
                      >
                        <span className="shrink-0 text-gray-400 dark:text-gray-500">
                          {isImage ? '👁' : '↓'}
                        </span>
                        <span className="truncate">{a.filename}</span>
                      </a>
                    )
                  })}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-white dark:text-white">
                    {t('tickets.detail.sidebar_classification')}
                  </CardTitle>
                  {isStaffOrAdmin && !ctiEdit && (
                    <button className="text-xs text-blue-600 dark:text-[#faff69] hover:underline" onClick={startCtiEdit}>
                      {t('tickets.detail.edit')}
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {ctiEdit ? (
                  <div className="space-y-2">
                    <div className="space-y-0.5">
                      <Label className="text-xs text-gray-500 dark:text-gray-400">{t('ticket.category')}</Label>
                      <Select
                        className="h-7 text-xs w-full"
                        value={ctiCategoryId}
                        onChange={(e) => { setCtiCategoryId(e.target.value); setCtiTypeId(''); setCtiItemId('') }}
                      >
                        <option value="">{t('tickets.detail.select_select')}</option>
                        {categories.filter((c) => c.active).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </Select>
                    </div>
                    {ctiTypes.length > 0 && (
                      <div className="space-y-0.5">
                        <Label className="text-xs text-gray-500 dark:text-gray-400">{t('ticket.type')}</Label>
                        <Select
                          className="h-7 text-xs w-full"
                          value={ctiTypeId}
                          onChange={(e) => { setCtiTypeId(e.target.value); setCtiItemId('') }}
                        >
                          <option value="">{t('tickets.detail.select_none')}</option>
                          {ctiTypes.filter((t) => t.active).map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </Select>
                      </div>
                    )}
                    {ctiItems.length > 0 && (
                      <div className="space-y-0.5">
                        <Label className="text-xs text-gray-500 dark:text-gray-400">{t('ticket.item')}</Label>
                        <Select
                          className="h-7 text-xs w-full"
                          value={ctiItemId}
                          onChange={(e) => setCtiItemId(e.target.value)}
                        >
                          <option value="">{t('tickets.detail.select_none')}</option>
                          {ctiItems.filter((i) => i.active).map((i) => (
                            <option key={i.id} value={i.id}>{i.name}</option>
                          ))}
                        </Select>
                      </div>
                    )}
                    {ctiError && <p className="text-xs text-red-600">{ctiError}</p>}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => ctiMutation.mutate()}
                        disabled={ctiMutation.isPending || !ctiCategoryId}
                      >
                        {ctiMutation.isPending ? t('tickets.detail.saving') : t('tickets.detail.save')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setCtiEdit(false); setCtiError('') }}
                      >
                        {t('tickets.detail.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-white/70 dark:text-white/70">{t('ticket.category')}</span>
                      <span className="text-right text-xs font-medium text-white">{categoryName ?? '—'}</span>
                    </div>
                    {ticket.type_id && (
                      <div className="flex justify-between">
                        <span className="text-white/70 dark:text-white/70">{t('ticket.type')}</span>
                        <span className="text-right text-xs text-white">{typeName ?? '—'}</span>
                      </div>
                    )}
                    {ticket.item_id && (
                      <div className="flex justify-between">
                        <span className="text-white/70 dark:text-white/70">{t('ticket.item')}</span>
                        <span className="text-right text-xs text-white">{itemName ?? '—'}</span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-white dark:text-white">
                    {t('tickets.detail.sidebar_details')}
                  </CardTitle>
                  {isStaffOrAdmin && itsmEnabled && !detailsEdit && (
                    <button className="text-xs text-blue-600 dark:text-[#faff69] hover:underline" onClick={() => setDetailsEdit(true)}>
                      {t('tickets.detail.edit')}
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {detailsEdit ? (
                  <div className="space-y-2">
                    <div className="space-y-0.5">
                      <Label className="text-xs text-gray-500 dark:text-gray-400">{t('ticket.ticket_type')}</Label>
                      <Select
                        className="h-7 text-xs w-full"
                        value={editTicketType}
                        onChange={(e) => setEditTicketType(e.target.value)}
                      >
                        <option value="">{t('tickets.detail.select_select')}</option>
                        <option value="incident">{t('itsm.incident')}</option>
                        <option value="service_request">{t('itsm.service_request')}</option>
                        <option value="problem">{t('itsm.problem')}</option>
                        <option value="change_request">{t('itsm.change_request')}</option>
                      </Select>
                    </div>
                    {detailsError && <p className="text-xs text-red-600">{detailsError}</p>}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => detailsMutation.mutate()}
                        disabled={detailsMutation.isPending || !editTicketType}
                      >
                        {detailsMutation.isPending ? t('tickets.detail.saving') : t('tickets.detail.save')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setDetailsEdit(false); setEditTicketType(ticket.ticket_type ?? ''); setDetailsError('') }}
                      >
                        {t('tickets.detail.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {itsmEnabled && (
                      <div className="flex justify-between items-center">
                        <span className="text-white/70 dark:text-white/70">{t('ticket.ticket_type')}</span>
                        {ticket.ticket_type ? (
                          <Badge variant={ticketTypeVariant(ticket.ticket_type) as never}>
                            {t(`itsm.${ticket.ticket_type}` as any)}
                          </Badge>
                        ) : (
                          <span className="text-right text-xs text-white">—</span>
                        )}
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-white/70 dark:text-white/70">{t('ticket.priority')}</span>
                      <Badge variant={priorityVariant(ticket.priority) as never}>{t(`ticket.priority_${ticket.priority}` as any)}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/70 dark:text-white/70">{t('tickets.detail.created')}</span>
                      <span className="text-right text-xs text-white">{formatDate(ticket.created_at)}</span>
                    </div>
                    {ticket.resolved_at && (
                      <div className="flex justify-between">
                        <span className="text-white/70 dark:text-white/70">{t('tickets.detail.resolved')}</span>
                        <span className="text-right text-xs text-white">{formatDate(ticket.resolved_at)}</span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Avaliação de Atendimento (Rating) */}
            {(ticket.rating !== undefined && ticket.rating !== null) ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-white dark:text-white">
                    Feedback do Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={cn(
                          "h-5 w-5",
                          star <= (ticket.rating ?? 0)
                            ? "fill-[#faff69] text-[#faff69]"
                            : "text-gray-400 dark:text-gray-600"
                        )}
                      />
                    ))}
                    <span className="ml-2 text-sm font-semibold text-white">
                      {ticket.rating} / 5
                    </span>
                  </div>
                  {ticket.rating_comment && (
                    <p className="text-xs italic text-gray-300 dark:text-gray-400 border-l-2 border-[#faff69] pl-2 py-0.5 whitespace-pre-wrap">
                      "{ticket.rating_comment}"
                    </p>
                  )}
                  {ticket.rated_at && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">
                      Avaliado em: {formatDate(ticket.rated_at)}
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              (statusName === 'Resolved' || statusName === 'Closed') &&
              user && ticket.reporter_user_id === user.id && (
                <RatingForm ticketId={id} />
              )
            )}
          </div>
        </div>
      </div>

      {previewImageIndex !== null && imageAttachments.length > 0 && (() => {
        const activeImg = imageAttachments[previewImageIndex]
        const url = attachmentDownloadUrl(id, activeImg.id)
        
        return (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 md:p-10 transition-opacity duration-300 animate-in fade-in"
            onClick={() => setPreviewImageIndex(null)}
          >
            <div 
              className="relative max-w-5xl w-full max-h-full bg-white dark:bg-[#151515] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-gray-200 dark:border-gray-800"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header com botões e nome do arquivo */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-150 dark:border-[#2a2a2a] bg-gray-50/50 dark:bg-[#1a1a1a]/50">
                <span className="text-sm font-semibold text-gray-800 dark:text-white truncate pr-4">
                  {activeImg.filename}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={url}
                    download={activeImg.filename}
                    className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-[#2c2c2c] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    title={t('tickets.detail.download_img')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </a>
                  <button
                    onClick={() => setPreviewImageIndex(null)}
                    className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-[#2c2c2c] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    title={t('tickets.detail.close')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Área da Imagem + Navegação */}
              <div className="relative flex-1 overflow-auto bg-gray-150 dark:bg-[#101010] p-4 flex items-center justify-center min-h-[300px]">
                
                {/* Botão Anterior */}
                {imageAttachments.length > 1 && (
                  <button
                    onClick={() => setPreviewImageIndex((prev) => (prev !== null ? (prev - 1 + imageAttachments.length) % imageAttachments.length : null))}
                    className="absolute left-4 z-10 p-2.5 rounded-full bg-black/40 hover:bg-black/60 text-white transition-all shadow-md hover:scale-105"
                    title={t('tickets.detail.prev')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                  </button>
                )}

                <img
                  src={url}
                  alt={activeImg.filename}
                  className="max-w-full max-h-[70vh] object-contain rounded shadow-lg border border-gray-200 dark:border-gray-800"
                />

                {/* Botão Próximo */}
                {imageAttachments.length > 1 && (
                  <button
                    onClick={() => setPreviewImageIndex((prev) => (prev !== null ? (prev + 1) % imageAttachments.length : null))}
                    className="absolute right-4 z-10 p-2.5 rounded-full bg-black/40 hover:bg-black/60 text-white transition-all shadow-md hover:scale-105"
                    title={t('tickets.detail.next')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                )}
              </div>

              {/* Rodapé com Contador */}
              {imageAttachments.length > 1 && (
                <div className="bg-gray-50 dark:bg-[#1a1a1a] text-gray-500 dark:text-gray-400 text-center py-2 text-xs font-semibold px-4 border-t border-gray-100 dark:border-[#2a2a2a] tracking-wider">
                  {previewImageIndex + 1} / {imageAttachments.length}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </Layout>
  )
}

import React, { useState, useEffect } from 'react'
import { useParams } from '@tanstack/react-router'
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
} from '@/api/tickets'
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
          <span className="text-gray-400 dark:text-gray-600">Unassigned</span>
        )}
      </div>

      {/* Assignment controls */}
      <div className="flex gap-1 text-xs">
        <button
          className={`px-2 py-0.5 rounded ${mode === 'user' ? 'bg-blue-100 text-blue-700 dark:bg-[#1a1a1a] dark:text-[#faff69] font-medium' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white'}`}
          onClick={() => setMode('user')}
        >
          User
        </button>
        <button
          className={`px-2 py-0.5 rounded ${mode === 'group' ? 'bg-blue-100 text-blue-700 dark:bg-[#1a1a1a] dark:text-[#faff69] font-medium' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white'}`}
          onClick={() => setMode('group')}
        >
          Group
        </button>
      </div>

      <div className="flex gap-2">
        <Select
          className="h-8 text-xs flex-1"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">{mode === 'user' ? 'Select staff member…' : 'Select group…'}</option>
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
          Assign
        </Button>
      </div>

      {(assigneeUserId || assigneeGroupId) && (
        <button
          className="text-xs text-gray-400 hover:text-gray-600"
          onClick={() => unassignMutation.mutate()}
          disabled={unassignMutation.isPending}
        >
          Clear assignment
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
            Custom Fields
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
              Edit
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
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => { setEditValues(null); setSaveError('') }}
            >
              Cancel
            </Button>
          </div>
        )}
        {saveError && <p className="text-xs text-red-600">{saveError}</p>}
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function TicketDetailPage() {
  const { id } = useParams({ from: '/tickets/$id' })
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const [replyBody, setReplyBody] = useState('')
  const [replyInternal, setReplyInternal] = useState(false)
  const [replyNotify, setReplyNotify] = useState(true)
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [replyUploadStates, setReplyUploadStates] = useState<Record<string, UploadState> | undefined>()
  const [replyError, setReplyError] = useState('')
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [sseError, setSseError] = useState<string | null>(null)

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
      setSseError('Conexão SSE perdida ou não pôde ser estabelecida.')
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

  const statusName = statuses.find((s) => s.id === ticket?.status_id)?.name ?? '…'
  const statusColor = statuses.find((s) => s.id === ticket?.status_id)?.color

  const replyMutation = useMutation({
    mutationFn: () => addReply(id, replyBody, replyInternal, replyNotify),
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
  if (error || !ticket) return <Layout><p className="text-red-600">Ticket not found.</p></Layout>

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
              <span>Opened {formatDate(ticket.created_at)}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{ticket.subject}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                style={{ borderColor: statusColor, color: statusColor }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                {statusName}
              </span>
              <Badge variant={priorityVariant(ticket.priority) as never}>
                {ticket.priority}
              </Badge>
              {sseStatus === 'connected' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Tempo real ativo
                </span>
              )}
              {sseStatus === 'connecting' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Conectando...
                </span>
              )}
              {sseStatus === 'error' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-rose-500 font-medium" title={sseError || undefined}>
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  Sem tempo real
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
                Mark Resolved
              </Button>
            )}
            {canReopen && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reopenMutation.mutate()}
                disabled={reopenMutation.isPending}
              >
                Reopen
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Main column */}
          <div className="col-span-2 space-y-6">
            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-gray-500 dark:text-gray-400">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">
                  {ticket.description || <span className="text-gray-400 dark:text-gray-600">No description provided.</span>}
                </p>
              </CardContent>
            </Card>

            {/* Timeline */}
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Timeline</h2>
              {timeline.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500">No activity yet.</p>
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
                    ?? (r.author_id ? r.author_id.slice(0, 8) + '…' : 'Customer')

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
                        Internal
                      </span>
                    )
                  } else if (isSupport) {
                    cardClass = 'border border-[#e6e85e] bg-[#faff69] dark:border-[#b8ba00]/40 dark:bg-[#faff69]/10'
                    accentClass = 'border-l-4 border-l-[#b8ba00] dark:border-l-[#faff69]'
                    textClass = 'text-[#ffffff]'
                    badgeEl = (
                      <span className="rounded bg-black dark:bg-black px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase tracking-wide">
                        Support
                      </span>
                    )
                  } else {
                    cardClass = 'border border-emerald-100 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-950/10'
                    accentClass = 'border-l-4 border-l-emerald-400 dark:border-l-emerald-500'
                    textClass = 'text-[#ffffff]'
                    badgeEl = (
                      <span className="rounded bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                        Customer
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
                            {h.from_status_name}
                          </span>
                          {' → '}
                          <span style={{ color: h.to_status_color || undefined }} className="font-medium">
                            {h.to_status_name}
                          </span>
                          {h.changed_by_name ? ` · ${h.changed_by_name}` : ' · System'}
                        </>
                      ) : (
                        <>
                          Ticket opened as{' '}
                          <span style={{ color: h.to_status_color || undefined }} className="font-medium">
                            {h.to_status_name}
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
                    {isStaffOrAdmin ? 'Add work log entry' : 'Add reply'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isStaffOrAdmin && cannedResponses.length > 0 && (
                    <div className="flex items-center gap-2 mb-1 justify-end">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Canned response:</span>
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
                        <option value="">Insert template...</option>
                        {cannedResponses.map((cr) => (
                          <option key={cr.id} value={cr.id}>
                            {cr.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <Textarea
                    placeholder={isStaffOrAdmin ? 'Describe the work performed or add a note…' : 'Type your reply…'}
                    rows={4}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    disabled={!!replyUploadStates}
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
                          Internal note (not visible to customer)
                        </label>

                        {!replyInternal && (
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={replyNotify}
                              onChange={(e) => setReplyNotify(e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300"
                              disabled={!!replyUploadStates}
                            />
                            Send ticket update email to customer
                          </label>
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
                      ? 'Saving…'
                      : replyUploadStates
                      ? 'Uploading files…'
                      : isStaffOrAdmin
                      ? 'Save entry'
                      : 'Send reply'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {isStaffOrAdmin && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-white dark:text-white">
                    Assignee
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
                    SLA Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 dark:text-white/70">Status</span>
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
                        ? 'Breached'
                        : ticket.sla.status === 'amber'
                        ? 'Critical'
                        : 'Within SLA'}
                    </span>
                  </div>

                  {ticket.sla.response_deadline && (
                    <div className="flex justify-between flex-col gap-0.5 border-t border-gray-50 dark:border-[#2a2a2a] pt-2">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">Response Deadline</span>
                      <span className="text-xs font-mono text-gray-900 dark:text-white">
                        {formatDate(ticket.sla.response_deadline)}
                      </span>
                    </div>
                  )}

                  {ticket.sla.first_response_at ? (
                    <div className="flex justify-between flex-col gap-0.5">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">Responded At</span>
                      <span className="text-xs font-mono text-green-600 dark:text-emerald-400">
                        {formatDate(ticket.sla.first_response_at)}
                      </span>
                    </div>
                  ) : ticket.sla.response_breached_at ? (
                    <div className="flex justify-between flex-col gap-0.5">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">Response Breached</span>
                      <span className="text-xs font-mono text-red-600 dark:text-red-400">
                        {formatDate(ticket.sla.response_breached_at)}
                      </span>
                    </div>
                  ) : null}

                  {ticket.sla.resolution_deadline && (
                    <div className="flex justify-between flex-col gap-0.5 border-t border-gray-50 dark:border-[#2a2a2a] pt-2">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">Resolution Deadline</span>
                      <span className="text-xs font-mono text-gray-900 dark:text-white">
                        {formatDate(ticket.sla.resolution_deadline)}
                      </span>
                    </div>
                  )}

                  {ticket.sla.resolved_at ? (
                    <div className="flex justify-between flex-col gap-0.5">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">Resolved At</span>
                      <span className="text-xs font-mono text-green-600 dark:text-emerald-400">
                        {formatDate(ticket.sla.resolved_at)}
                      </span>
                    </div>
                  ) : ticket.sla.resolution_breached_at ? (
                    <div className="flex justify-between flex-col gap-0.5">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">Resolution Breached</span>
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
                  Tags
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
                    Attachments
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {attachments.map((a) => (
                    <a
                      key={a.id}
                      href={attachmentDownloadUrl(id, a.id)}
                      className="flex items-center gap-2 text-sm text-blue-600 dark:text-[#faff69] hover:underline truncate"
                      download={a.filename}
                    >
                      <span className="shrink-0 text-gray-400 dark:text-gray-500">↓</span>
                      <span className="truncate">{a.filename}</span>
                    </a>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-white dark:text-white">
                    Classification
                  </CardTitle>
                  {isStaffOrAdmin && !ctiEdit && (
                    <button className="text-xs text-blue-600 dark:text-[#faff69] hover:underline" onClick={startCtiEdit}>
                      Edit
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {ctiEdit ? (
                  <div className="space-y-2">
                    <div className="space-y-0.5">
                      <Label className="text-xs text-gray-500 dark:text-gray-400">Category</Label>
                      <Select
                        className="h-7 text-xs w-full"
                        value={ctiCategoryId}
                        onChange={(e) => { setCtiCategoryId(e.target.value); setCtiTypeId(''); setCtiItemId('') }}
                      >
                        <option value="">— select —</option>
                        {categories.filter((c) => c.active).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </Select>
                    </div>
                    {ctiTypes.length > 0 && (
                      <div className="space-y-0.5">
                        <Label className="text-xs text-gray-500 dark:text-gray-400">Type</Label>
                        <Select
                          className="h-7 text-xs w-full"
                          value={ctiTypeId}
                          onChange={(e) => { setCtiTypeId(e.target.value); setCtiItemId('') }}
                        >
                          <option value="">— none —</option>
                          {ctiTypes.filter((t) => t.active).map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </Select>
                      </div>
                    )}
                    {ctiItems.length > 0 && (
                      <div className="space-y-0.5">
                        <Label className="text-xs text-gray-500 dark:text-gray-400">Item</Label>
                        <Select
                          className="h-7 text-xs w-full"
                          value={ctiItemId}
                          onChange={(e) => setCtiItemId(e.target.value)}
                        >
                          <option value="">— none —</option>
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
                        {ctiMutation.isPending ? 'Saving…' : 'Save'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setCtiEdit(false); setCtiError('') }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-white/70 dark:text-white/70">Category</span>
                      <span className="text-right text-xs font-medium text-white">{categoryName ?? '—'}</span>
                    </div>
                    {ticket.type_id && (
                      <div className="flex justify-between">
                        <span className="text-white/70 dark:text-white/70">Type</span>
                        <span className="text-right text-xs text-white">{typeName ?? '—'}</span>
                      </div>
                    )}
                    {ticket.item_id && (
                      <div className="flex justify-between">
                        <span className="text-white/70 dark:text-white/70">Item</span>
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
                    Details
                  </CardTitle>
                  {isStaffOrAdmin && itsmEnabled && !detailsEdit && (
                    <button className="text-xs text-blue-600 dark:text-[#faff69] hover:underline" onClick={() => setDetailsEdit(true)}>
                      Edit
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {detailsEdit ? (
                  <div className="space-y-2">
                    <div className="space-y-0.5">
                      <Label className="text-xs text-gray-500 dark:text-gray-400">Ticket Type</Label>
                      <Select
                        className="h-7 text-xs w-full"
                        value={editTicketType}
                        onChange={(e) => setEditTicketType(e.target.value)}
                      >
                        <option value="">— select —</option>
                        <option value="incident">Incident</option>
                        <option value="service_request">Service Request</option>
                        <option value="problem">Problem</option>
                        <option value="change_request">Change Request</option>
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
                        {detailsMutation.isPending ? 'Saving…' : 'Save'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setDetailsEdit(false); setEditTicketType(ticket.ticket_type ?? ''); setDetailsError('') }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {itsmEnabled && (
                      <div className="flex justify-between items-center">
                        <span className="text-white/70 dark:text-white/70">Ticket Type</span>
                        {ticket.ticket_type ? (
                          <Badge variant={ticketTypeVariant(ticket.ticket_type) as never}>
                            {ticket.ticket_type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </Badge>
                        ) : (
                          <span className="text-right text-xs text-white">—</span>
                        )}
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-white/70 dark:text-white/70">Priority</span>
                      <Badge variant={priorityVariant(ticket.priority) as never}>{ticket.priority}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/70 dark:text-white/70">Created</span>
                      <span className="text-right text-xs text-white">{formatDate(ticket.created_at)}</span>
                    </div>
                    {ticket.resolved_at && (
                      <div className="flex justify-between">
                        <span className="text-white/70 dark:text-white/70">Resolved</span>
                        <span className="text-right text-xs text-white">{formatDate(ticket.resolved_at)}</span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  )
}

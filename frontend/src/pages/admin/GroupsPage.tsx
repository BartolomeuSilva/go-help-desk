import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  listGroupMembers,
  addGroupMember,
  removeGroupMember,
} from '@/api/admin'
import { listUsers } from '@/api/admin'
import { extractError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { PlusIcon, Trash2Icon, UsersIcon, PencilIcon, XIcon, CheckIcon } from 'lucide-react'
import type { Group, User } from '@/api/types'
import { useT } from '@/i18n'

// ── Inline editable group name ────────────────────────────────────────────────

function GroupNameEditor({ group, onSaved }: { group: Group; onSaved: () => void }) {
  const { t } = useT()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [desc, setDesc] = useState(group.description)
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => updateGroup(group.id, { name, description: desc }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      setEditing(false)
      setError('')
      onSaved()
    },
    onError: (err) => setError(extractError(err)),
  })

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <div>
          <div className="font-medium text-gray-900">{group.name}</div>
          {group.description && <div className="text-xs text-gray-500">{group.description}</div>}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="text-gray-400 hover:text-gray-600 ml-1"
          title={t('groups.editor.edit_group_title')}
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-7 text-sm"
        autoFocus
      />
      <Input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        className="h-7 text-xs"
        placeholder={t('groups.editor.desc_placeholder')}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-1">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="text-green-600 hover:text-green-700"
          title={t('common.save')}
        >
          <CheckIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => { setEditing(false); setName(group.name); setDesc(group.description) }}
          className="text-gray-400 hover:text-gray-600"
          title={t('common.cancel')}
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Members panel ─────────────────────────────────────────────────────────────

function MembersPanel({ group, allUsers }: { group: Group; allUsers: User[] }) {
  const { t } = useT()
  const [selectedUserId, setSelectedUserId] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const { data: members = [] } = useQuery({
    queryKey: ['group-members', group.id],
    queryFn: () => listGroupMembers(group.id),
  })

  const memberIds = new Set(members.map((m) => m.id))
  const eligible = allUsers.filter((u) => (u.role === 'staff' || u.role === 'admin') && !memberIds.has(u.id))

  const addMutation = useMutation({
    mutationFn: () => addGroupMember(group.id, selectedUserId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group-members', group.id] })
      setSelectedUserId('')
      setError('')
    },
    onError: (err) => setError(extractError(err)),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeGroupMember(group.id, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group-members', group.id] }),
    onError: (err) => setError(extractError(err)),
  })

  return (
    <div className="space-y-3">
      {members.length === 0 ? (
        <p className="text-xs text-gray-400">{t('groups.members.no_members')}</p>
      ) : (
        <ul className="space-y-1">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between text-sm">
              <span>
                {m.display_name}
                <span className="ml-1 text-xs text-gray-400">{m.email}</span>
              </span>
              <button
                onClick={() => removeMutation.mutate(m.id)}
                disabled={removeMutation.isPending}
                className="text-gray-400 hover:text-red-500"
                title={t('groups.members.remove_title')}
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {eligible.length > 0 && (
        <div className="flex gap-2">
          <Select
            className="h-8 text-xs flex-1"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">{t('groups.members.add_staff_placeholder')}</option>
            {eligible.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name} ({u.email})
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => addMutation.mutate()}
            disabled={!selectedUserId || addMutation.isPending}
          >
            {t('groups.members.add_button')}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ── Group row ─────────────────────────────────────────────────────────────────

function GroupRow({ group, allUsers, onDelete }: { group: Group; allUsers: User[]; onDelete: () => void }) {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between gap-3">
          <GroupNameEditor group={group} onSaved={() => {}} />
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <UsersIcon className="h-3.5 w-3.5" />
              {t('groups.row.members_button')}
            </button>
            <button
              onClick={onDelete}
              className="text-gray-400 hover:text-red-500"
              title={t('groups.row.delete_button')}
            >
              <Trash2Icon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 px-4 pb-4">
          <MembersPanel group={group} allUsers={allUsers} />
        </CardContent>
      )}
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function GroupsPage() {
  const { t } = useT()
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [formError, setFormError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Group | null>(null)

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
  })

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers(),
  })

  const createMutation = useMutation({
    mutationFn: () => createGroup({ name: newName.trim(), description: newDesc.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      setNewName('')
      setNewDesc('')
      setFormError('')
    },
    onError: (err) => setFormError(extractError(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      setPendingDelete(null)
    },
  })

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{t('groups.title')}</h1>
        </div>

        <p className="text-sm text-gray-500">
          {t('groups.subtitle')}
        </p>

        {/* Create form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('groups.new_group')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t('groups.form.name')}</Label>
                <Input
                  placeholder={t('groups.form.name_placeholder')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t('groups.form.description')}</Label>
                <Input
                  placeholder={t('groups.form.desc_placeholder')}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || createMutation.isPending}
              size="sm"
            >
              <PlusIcon className="mr-2 h-4 w-4" />
              {createMutation.isPending ? t('groups.form.creating') : t('groups.form.create')}
            </Button>
          </CardContent>
        </Card>

        {/* Group list */}
        {isLoading ? (
          <p className="text-sm text-gray-500">{t('common.loading')}</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-500">{t('groups.list.empty')}</p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <GroupRow
                key={g.id}
                group={g}
                allUsers={allUsers}
                onDelete={() => setPendingDelete(g)}
              />
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={`${t('groups.delete_confirm_title')} "${pendingDelete?.name ?? ''}"?`}
        description={t('groups.delete_confirm_desc')}
        confirmLabel={t('groups.row.delete_button')}
        isPending={deleteMutation.isPending}
        onConfirm={() => { if (pendingDelete) deleteMutation.mutate(pendingDelete.id) }}
      />
    </Layout>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listRoles, createRole, updateRole, deleteRole } from '@/api/roles'
import type { Permission, RoleDetails } from '@/api/roles'
import { extractError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { PlusIcon, PencilIcon, Trash2Icon, ShieldIcon } from 'lucide-react'

const AVAILABLE_PERMISSIONS: { name: Permission; label: string; description: string }[] = [
  {
    name: 'tickets:create',
    label: 'Create Tickets',
    description: 'Allows creating new support tickets.',
  },
  {
    name: 'tickets:read',
    label: 'Read Tickets',
    description: 'Allows viewing and browsing tickets.',
  },
  {
    name: 'tickets:update',
    label: 'Update Tickets',
    description: 'Allows updating ticket categories, priorities, assignments, and status.',
  },
  {
    name: 'tickets:reply',
    label: 'Reply to Tickets',
    description: 'Allows replying to tickets and posting internal notes.',
  },
  {
    name: 'tickets:delete',
    label: 'Delete Tickets',
    description: 'Allows permanently deleting tickets.',
  },
  {
    name: 'kb:manage',
    label: 'Manage KB',
    description: 'Allows creating, editing, and deleting knowledge base categories and articles.',
  },
  {
    name: 'canned:manage',
    label: 'Manage Canned Responses',
    description: 'Allows creating, editing, and deleting canned response templates.',
  },
  {
    name: 'tags:manage',
    label: 'Manage Tags',
    description: 'Allows creating and deleting tags.',
  },
  {
    name: 'users:manage',
    label: 'Manage Users',
    description: 'Allows managing users, groups, and roles/permissions.',
  },
  {
    name: 'settings:manage',
    label: 'Manage Settings',
    description: 'Allows modifying system-wide settings, branding, and integrations.',
  },
]

export function RoleAdminPage() {
  const qc = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editRoleName, setEditRoleName] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>([])
  const [formError, setFormError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<RoleDetails | null>(null)

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: listRoles,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createRole({
        name: name.trim(),
        description: description.trim(),
        permissions: selectedPermissions,
      }),
    onSuccess: () => {
      resetForm()
      qc.invalidateQueries({ queryKey: ['admin', 'roles'] })
    },
    onError: (err) => setFormError(extractError(err)),
  })

  const updateMutation = useMutation({
    mutationFn: (roleName: string) =>
      updateRole(roleName, {
        description: description.trim(),
        permissions: selectedPermissions,
      }),
    onSuccess: () => {
      resetForm()
      qc.invalidateQueries({ queryKey: ['admin', 'roles'] })
    },
    onError: (err) => setFormError(extractError(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (roleName: string) => deleteRole(roleName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'roles'] })
      setPendingDelete(null)
    },
    onError: (err) => {
      alert(extractError(err))
      setPendingDelete(null)
    },
  })

  const handleEditClick = (role: RoleDetails) => {
    setIsEditing(true)
    setEditRoleName(role.name)
    setName(role.name)
    setDescription(role.description)
    setSelectedPermissions(role.permissions)
    setFormError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleNewClick = () => {
    setIsEditing(true)
    setEditRoleName(null)
    setName('')
    setDescription('')
    setSelectedPermissions([])
    setFormError('')
  }

  const resetForm = () => {
    setIsEditing(false)
    setEditRoleName(null)
    setName('')
    setDescription('')
    setSelectedPermissions([])
    setFormError('')
  }

  const handlePermissionToggle = (perm: Permission) => {
    setSelectedPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('Role Name is required')
      return
    }
    if (editRoleName) {
      updateMutation.mutate(editRoleName)
    } else {
      createMutation.mutate()
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Roles & Permissions</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Create and manage custom roles to define granular access control (RBAC) for agents and support staff.
            </p>
          </div>
          {!isEditing && (
            <Button onClick={handleNewClick} className="ml-6 shrink-0">
              <PlusIcon className="mr-2 h-4 w-4" />
              New Role
            </Button>
          )}
        </div>

        {/* Create/Edit Form */}
        {isEditing && (
          <Card className="border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] shadow-sm">
            <CardHeader className="bg-gray-50/50 dark:bg-[#121212]/50 border-b border-gray-200 dark:border-[#2a2a2a] py-4">
              <CardTitle className="text-sm font-semibold text-gray-800 dark:text-white">
                {editRoleName ? `Edit Role: ${editRoleName}` : 'New Custom Role'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="role-name">Role Name</Label>
                    <Input
                      id="role-name"
                      placeholder="e.g. Tier 1 Support"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value)
                        setFormError('')
                      }}
                      disabled={editRoleName !== null}
                      autoFocus={editRoleName === null}
                    />
                    <p className="text-xs text-gray-400">
                      The identifier name for the role. Cannot be changed after creation.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="role-description">Description</Label>
                    <Textarea
                      id="role-description"
                      placeholder="Describe what this role is used for..."
                      rows={2}
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value)
                        setFormError('')
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-semibold text-gray-800 dark:text-white">Permissions</Label>
                  <p className="text-xs text-gray-400 mb-3">
                    Assign capability flags to this role. Users with this role will gain access to these operations.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {AVAILABLE_PERMISSIONS.map((perm) => (
                      <label
                        key={perm.name}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-gray-50/50 dark:hover:bg-[#1f1f1f]/50 ${
                          selectedPermissions.includes(perm.name)
                            ? 'border-blue-500 bg-blue-50/10 dark:bg-blue-950/10'
                            : 'border-gray-200 dark:border-[#2a2a2a]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={selectedPermissions.includes(perm.name)}
                          onChange={() => handlePermissionToggle(perm.name)}
                        />
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {perm.label}
                          </span>
                          <p className="text-xs text-gray-400 leading-tight">
                            {perm.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {formError && <p className="text-sm text-red-600 font-medium">{formError}</p>}
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="submit"
                    disabled={
                      !name.trim() ||
                      createMutation.isPending ||
                      updateMutation.isPending
                    }
                  >
                    {createMutation.isPending || updateMutation.isPending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* List Grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#0a0a0a] shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[#121212] text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-[#2a2a2a]">
                <tr>
                  <th className="px-6 py-3.5 text-left font-semibold w-56">Role Name</th>
                  <th className="px-6 py-3.5 text-left font-semibold">Description</th>
                  <th className="px-6 py-3.5 text-left font-semibold">Permissions</th>
                  <th className="w-28 px-6 py-3.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#1a1a1a]">
                {roles.map((role) => (
                  <tr key={role.name} className="group hover:bg-gray-50/50 dark:hover:bg-[#121212]/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">{role.name}</span>
                        {role.is_system ? (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 flex items-center gap-1">
                            <ShieldIcon className="h-3 w-3" /> System
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 flex items-center gap-1 border-blue-500/30 text-blue-600 bg-blue-50/10">
                            Custom
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                      {role.description || <span className="text-gray-400 italic">No description</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-xl">
                        {role.permissions.map((perm) => (
                          <Badge
                            key={perm}
                            variant="outline"
                            className="text-[10px] bg-gray-50 dark:bg-[#151515] text-gray-600 dark:text-gray-400 capitalize"
                          >
                            {perm.replace(':', ' ')}
                          </Badge>
                        ))}
                        {role.permissions.length === 0 && (
                          <span className="text-xs text-gray-400 italic">No permissions</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {!role.is_system ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-[#1a1a1a]"
                            onClick={() => handleEditClick(role)}
                            title="Edit Role"
                          >
                            <PencilIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 dark:hover:text-red-300"
                            onClick={() => setPendingDelete(role)}
                            title="Delete Role"
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 italic pr-2">Read-Only</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={`Delete custom role "${pendingDelete?.name ?? ''}"?`}
        description="Are you sure you want to permanently delete this role? This will prevent any users assigned to it from authenticating or performing actions associated with this role."
        confirmLabel="Delete"
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.name)
        }}
      />
    </Layout>
  )
}

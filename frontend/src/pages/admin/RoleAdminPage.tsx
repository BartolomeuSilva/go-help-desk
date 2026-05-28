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
import { useT } from '@/i18n'

const AVAILABLE_PERMISSIONS: { name: Permission; labelKey: string; descKey: string }[] = [
  {
    name: 'tickets:create',
    labelKey: 'permissions.tickets:create.label',
    descKey: 'permissions.tickets:create.desc',
  },
  {
    name: 'tickets:read',
    labelKey: 'permissions.tickets:read.label',
    descKey: 'permissions.tickets:read.desc',
  },
  {
    name: 'tickets:update',
    labelKey: 'permissions.tickets:update.label',
    descKey: 'permissions.tickets:update.desc',
  },
  {
    name: 'tickets:reply',
    labelKey: 'permissions.tickets:reply.label',
    descKey: 'permissions.tickets:reply.desc',
  },
  {
    name: 'tickets:delete',
    labelKey: 'permissions.tickets:delete.label',
    descKey: 'permissions.tickets:delete.desc',
  },
  {
    name: 'kb:manage',
    labelKey: 'permissions.kb:manage.label',
    descKey: 'permissions.kb:manage.desc',
  },
  {
    name: 'canned:manage',
    labelKey: 'permissions.canned:manage.label',
    descKey: 'permissions.canned:manage.desc',
  },
  {
    name: 'tags:manage',
    labelKey: 'permissions.tags:manage.label',
    descKey: 'permissions.tags:manage.desc',
  },
  {
    name: 'users:manage',
    labelKey: 'permissions.users:manage.label',
    descKey: 'permissions.users:manage.desc',
  },
  {
    name: 'settings:manage',
    labelKey: 'permissions.settings:manage.label',
    descKey: 'permissions.settings:manage.desc',
  },
]

export function RoleAdminPage() {
  const { t } = useT()
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
      setFormError(t('roles.admin.form.err_name_required'))
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('roles.admin.title')}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('roles.admin.subtitle')}
            </p>
          </div>
          {!isEditing && (
            <Button onClick={handleNewClick} className="ml-6 shrink-0">
              <PlusIcon className="mr-2 h-4 w-4" />
              {t('roles.admin.new_role')}
            </Button>
          )}
        </div>

        {/* Create/Edit Form */}
        {isEditing && (
          <Card className="border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] shadow-sm">
            <CardHeader className="bg-gray-50/50 dark:bg-[#121212]/50 border-b border-gray-200 dark:border-[#2a2a2a] py-4">
              <CardTitle className="text-sm font-semibold text-gray-880 dark:text-white">
                {editRoleName
                  ? t('roles.admin.form.edit_title').replace('{name}', editRoleName)
                  : t('roles.admin.form.new_title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="role-name">{t('roles.admin.form.name')}</Label>
                    <Input
                      id="role-name"
                      placeholder={t('roles.admin.form.name_placeholder')}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value)
                        setFormError('')
                      }}
                      disabled={editRoleName !== null}
                      autoFocus={editRoleName === null}
                    />
                    <p className="text-xs text-gray-400">
                      {t('roles.admin.form.name_hint')}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="role-description">{t('roles.admin.form.description')}</Label>
                    <Textarea
                      id="role-description"
                      placeholder={t('roles.admin.form.desc_placeholder')}
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
                  <Label className="text-base font-semibold text-gray-800 dark:text-white">
                    {t('roles.admin.form.permissions')}
                  </Label>
                  <p className="text-xs text-gray-400 mb-3">
                    {t('roles.admin.form.permissions_hint')}
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
                            {t(perm.labelKey as any)}
                          </span>
                          <p className="text-xs text-gray-400 leading-tight">
                            {t(perm.descKey as any)}
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
                    {createMutation.isPending || updateMutation.isPending
                      ? t('roles.admin.form.saving')
                      : t('common.save')}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    {t('common.cancel')}
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
                  <th className="px-6 py-3.5 text-left font-semibold w-56">{t('roles.admin.table.name')}</th>
                  <th className="px-6 py-3.5 text-left font-semibold">{t('roles.admin.table.description')}</th>
                  <th className="px-6 py-3.5 text-left font-semibold">{t('roles.admin.table.permissions')}</th>
                  <th className="w-28 px-6 py-3.5 text-right font-semibold">{t('roles.admin.table.actions')}</th>
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
                            <ShieldIcon className="h-3 w-3" /> {t('roles.admin.badge.system')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 flex items-center gap-1 border-blue-500/30 text-blue-600 bg-blue-50/10">
                            {t('roles.admin.badge.custom')}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                      {role.description || <span className="text-gray-400 italic">{t('roles.admin.list.no_description')}</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-xl">
                        {role.permissions.map((perm) => {
                          const matchingPerm = AVAILABLE_PERMISSIONS.find((p) => p.name === perm)
                          return (
                            <Badge
                              key={perm}
                              variant="outline"
                              className="text-[10px] bg-gray-50 dark:bg-[#151515] text-gray-600 dark:text-gray-400 capitalize"
                            >
                              {matchingPerm ? t(matchingPerm.labelKey as any) : perm.replace(':', ' ')}
                            </Badge>
                          )
                        })}
                        {role.permissions.length === 0 && (
                          <span className="text-xs text-gray-400 italic">{t('roles.admin.list.no_permissions')}</span>
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
                            title={t('roles.admin.actions.edit_tooltip')}
                          >
                            <PencilIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 dark:hover:text-red-300"
                            onClick={() => setPendingDelete(role)}
                            title={t('roles.admin.actions.delete_tooltip')}
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 italic pr-2">{t('roles.admin.list.read_only')}</div>
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
        title={t('roles.admin.delete.confirm_title').replace('{name}', pendingDelete?.name ?? '')}
        description={t('roles.admin.delete.confirm_desc')}
        confirmLabel={t('common.delete')}
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.name)
        }}
      />
    </Layout>
  )
}


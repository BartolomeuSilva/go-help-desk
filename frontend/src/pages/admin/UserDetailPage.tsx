import { useState, useEffect } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getUser, updateUser, adminResetPassword, deleteUser,
  listGroups, addGroupMember, removeGroupMember,
} from '@/api/admin'
import { extractError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { ArrowLeftIcon, ShieldCheckIcon, ShieldOffIcon } from 'lucide-react'
import type { Role } from '@/api/types'
import { listRoles } from '@/api/roles'
import { useT } from '@/i18n'

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-500">{label}</Label>
      {children}
    </div>
  )
}

export function UserDetailPage() {
  const { t } = useT()
  const { id } = useParams({ from: '/admin/users/$id' })
  const navigate = useNavigate()
  const qc = useQueryClient()

  // ── Profile state ───────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [profileError, setProfileError] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)

  // ── Password state ──────────────────────────────────────────────────────────
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)

  // ── Group state ─────────────────────────────────────────────────────────────
  const [addGroupId, setAddGroupId] = useState('')
  const [groupError, setGroupError] = useState('')

  // ── Delete confirm ──────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: user, isLoading } = useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => getUser(id),
  })

  const { data: allGroups = [] } = useQuery({
    queryKey: ['admin', 'groups'],
    queryFn: listGroups,
  })

  const { data: roles = [] } = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: listRoles,
  })

  // Get all unique role names, starting with system roles, then adding custom roles
  const roleOptions = Array.from(new Set([
    'admin',
    'staff',
    'user',
    ...roles.map((r) => r.name),
    role,
  ]))

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name)
      setEmail(user.email)
      setRole(user.role)
    }
  }, [user])

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['admin', 'users', id] })
    qc.invalidateQueries({ queryKey: ['admin', 'users'] })
  }

  // ── Profile mutation ────────────────────────────────────────────────────────
  const profileMutation = useMutation({
    mutationFn: () => updateUser(id, { display_name: displayName, email, role }),
    onSuccess: () => {
      setProfileSaved(true)
      setProfileError('')
      setTimeout(() => setProfileSaved(false), 2500)
      invalidate()
    },
    onError: (err) => setProfileError(extractError(err)),
  })

  // ── Toggle disabled ─────────────────────────────────────────────────────────
  const toggleDisabledMutation = useMutation({
    mutationFn: (disabled: boolean) => updateUser(id, { disabled }),
    onSuccess: () => invalidate(),
  })

  // ── Reset MFA ───────────────────────────────────────────────────────────────
  const resetMFAMutation = useMutation({
    mutationFn: () => updateUser(id, { reset_mfa: true }),
    onSuccess: () => invalidate(),
  })

  // ── Password reset ──────────────────────────────────────────────────────────
  const passwordMutation = useMutation({
    mutationFn: () => adminResetPassword(id, newPassword),
    onSuccess: () => {
      setNewPassword('')
      setPasswordSaved(true)
      setPasswordError('')
      setTimeout(() => setPasswordSaved(false), 2500)
    },
    onError: (err) => setPasswordError(extractError(err)),
  })

  // ── Group mutations ─────────────────────────────────────────────────────────
  const addToGroupMutation = useMutation({
    mutationFn: () => addGroupMember(addGroupId, id),
    onSuccess: () => {
      setAddGroupId('')
      setGroupError('')
      invalidate()
    },
    onError: (err) => setGroupError(extractError(err)),
  })

  const removeFromGroupMutation = useMutation({
    mutationFn: (groupId: string) => removeGroupMember(groupId, id),
    onSuccess: () => invalidate(),
  })

  // ── Delete ──────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(id),
    onSuccess: () => navigate({ to: '/admin/users' }),
  })

  if (isLoading || !user) {
    return <Layout><div className="flex justify-center py-16"><Spinner /></div></Layout>
  }

  const memberGroupIds = new Set(user.groups.map((g) => g.id))
  const availableGroups = allGroups.filter((g) => !memberGroupIds.has(g.id))

  function authTypeLabel(authType: string) {
    if (authType === 'saml') return t('users.auth_type.sso')
    if (authType === 'both') return t('users.auth_type.both')
    return t('users.auth_type.local')
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate({ to: '/admin/users' })}
            className="mb-3 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            {t('user_detail.back_to_users')}
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{user.display_name}</h1>
            {user.disabled && (
              <Badge variant="secondary" className="text-xs">{t('users.disabled')}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{user.email}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ── Profile ──────────────────────────────────────────────────── */}
          <SectionCard title={t('user_detail.profile')}>
            <FieldRow label={t('users.display_name')}>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={user.disabled}
              />
            </FieldRow>
            <FieldRow label={t('user_detail.email_address')}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={user.disabled}
              />
            </FieldRow>
            <FieldRow label={t('users.role')}>
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={user.disabled}
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r} className="capitalize">{r}</option>
                ))}
              </Select>
            </FieldRow>
            {user.disabled && (
              <p className="text-xs text-amber-600">{t('user_detail.profile_disabled_hint')}</p>
            )}
            {profileError && <p className="text-sm text-red-600">{profileError}</p>}
            <div className="flex items-center gap-3 pt-1">
              <Button
                size="sm"
                onClick={() => profileMutation.mutate()}
                disabled={profileMutation.isPending || user.disabled}
              >
                {profileMutation.isPending ? t('user_detail.saving') : t('user_detail.save_profile')}
              </Button>
              {profileSaved && <span className="text-sm text-green-600">{t('settings.saved')}</span>}
            </div>
          </SectionCard>

          {/* ── Account ──────────────────────────────────────────────────── */}
          <SectionCard title={t('user_detail.account')}>
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">{t('user_detail.member_since')}</p>
                <p className="font-medium text-gray-800">
                  {new Date(user.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">{t('user_detail.login_type')}</p>
                <p className="font-medium text-gray-800">{authTypeLabel(user.auth_type)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">{t('user_detail.mfa')}</p>
                <div className="flex items-center gap-1.5">
                  {user.mfa_enabled ? (
                    <>
                      <ShieldCheckIcon className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-green-700">{t('user_detail.mfa_enrolled')}</span>
                    </>
                  ) : (
                    <>
                      <ShieldOffIcon className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-gray-500">{t('user_detail.mfa_not_enrolled')}</span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">{t('user_detail.status')}</p>
                <p className={`font-medium ${user.disabled ? 'text-red-600' : 'text-green-700'}`}>
                  {user.disabled ? t('user_detail.disabled') : t('user_detail.active')}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t space-y-3">
              {/* MFA reset */}
              {user.mfa_enabled && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{t('user_detail.reset_mfa')}</p>
                    <p className="text-xs text-gray-500">{t('user_detail.reset_mfa_desc')}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resetMFAMutation.mutate()}
                    disabled={resetMFAMutation.isPending}
                  >
                    {resetMFAMutation.isPending ? t('user_detail.resetting') : t('user_detail.reset_mfa_button')}
                  </Button>
                </div>
              )}

              {/* Enable / Disable */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {user.disabled ? t('user_detail.enable_account') : t('user_detail.disable_account')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {user.disabled
                      ? t('user_detail.enable_desc')
                      : t('user_detail.disable_desc')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={user.disabled ? 'text-green-700 border-green-300 hover:bg-green-50' : 'text-red-600 border-red-200 hover:bg-red-50'}
                  onClick={() => toggleDisabledMutation.mutate(!user.disabled)}
                  disabled={toggleDisabledMutation.isPending}
                >
                  {toggleDisabledMutation.isPending
                    ? '…'
                    : user.disabled ? t('user_detail.enable') : t('user_detail.disable')}
                </Button>
              </div>

              {/* Password reset */}
              {user.has_password && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium text-gray-700">{t('user_detail.reset_password')}</p>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder={t('user_detail.new_password')}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => passwordMutation.mutate()}
                      disabled={passwordMutation.isPending || !newPassword}
                    >
                      {passwordMutation.isPending ? t('user_detail.setting_password') : t('user_detail.set_password')}
                    </Button>
                  </div>
                  {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
                  {passwordSaved && <p className="text-sm text-green-600">{t('user_detail.password_updated')}</p>}
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* ── Groups ─────────────────────────────────────────────────────── */}
        <SectionCard title={t('user_detail.groups')}>
          {user.groups.length === 0 ? (
            <p className="text-sm text-gray-400">{t('user_detail.no_groups')}</p>
          ) : (
            <div className="divide-y rounded-md border">
              {user.groups.map((g) => (
                <div key={g.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{g.name}</span>
                    {g.description && (
                      <span className="ml-2 text-xs text-gray-400">{g.description}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-red-600"
                    onClick={() => removeFromGroupMutation.mutate(g.id)}
                    disabled={removeFromGroupMutation.isPending}
                  >
                    {t('user_detail.remove_group')}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {availableGroups.length > 0 && (
            <div className="flex gap-2 pt-1">
              <Select
                value={addGroupId}
                onChange={(e) => setAddGroupId(e.target.value)}
                className="flex-1"
              >
                <option value="">{t('user_detail.add_to_group_placeholder')}</option>
                {availableGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </Select>
              <Button
                size="sm"
                onClick={() => addToGroupMutation.mutate()}
                disabled={!addGroupId || addToGroupMutation.isPending}
              >
                {addToGroupMutation.isPending ? t('user_detail.adding') : t('user_detail.add')}
              </Button>
            </div>
          )}
          {groupError && <p className="text-sm text-red-600">{groupError}</p>}
        </SectionCard>

        {/* ── Danger zone ─────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
          <h2 className="text-sm font-semibold text-red-700 mb-1">{t('user_detail.danger_zone')}</h2>
          <p className="text-sm text-red-600 mb-3">
            {t('user_detail.danger_zone_desc')}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-100"
            onClick={() => setConfirmDelete(true)}
          >
            {t('user_detail.delete_user')}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`${t('user_detail.delete_confirm_title')} "${user?.display_name ?? 'user'}"?`}
        description={t('user_detail.delete_confirm_desc')}
        confirmLabel={t('user_detail.delete_user')}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </Layout>
  )
}

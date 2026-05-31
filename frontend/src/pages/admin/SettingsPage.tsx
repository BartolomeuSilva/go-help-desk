import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, updateSettings, getSAMLConfig, saveSAMLConfig, getSiteConfig, uploadLogo, deleteLogo, uploadLogoDark, deleteLogoDark, listStatuses, listCategories, listSLAPolicies, createSLAPolicy, updateSLAPolicy, deleteSLAPolicy, getWhatsAppStatus, getWhatsAppQRCode } from '@/api/admin'
import type { SLAPolicy } from '@/api/types'
import { extractError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef } from 'react'
import { useT } from '@/i18n'

// ── Shared primitives ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
        checked ? 'bg-blue-600' : 'bg-gray-200'
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
      <div className="divide-y rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] dark:divide-[#2a2a2a]">{children}</div>
    </div>
  )
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-8 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {description && <div className="mt-0.5 text-sm text-gray-500">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SaveBar({ onSave, isPending, error, saved }: {
  onSave: () => void
  isPending: boolean
  error: string
  saved: boolean
}) {
  const { t } = useT()
  return (
    <div className="flex items-center gap-3 pt-2">
      <Button onClick={onSave} disabled={isPending}>
        {isPending ? t('settings.saving') : t('settings.save_changes')}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">{t('settings.saved')}</p>}
    </div>
  )
}

// ── SAML section ──────────────────────────────────────────────────────────────

function SAMLSection() {
  const qc = useQueryClient()
  const certFileRef = useRef<HTMLInputElement>(null)
  const keyFileRef = useRef<HTMLInputElement>(null)

  const [metadataURL, setMetadataURL] = useState('')
  const [certPEM, setCertPEM] = useState('')
  const [keyPEM, setKeyPEM] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [warning, setWarning] = useState('')

  const { data: saml, isLoading } = useQuery({
    queryKey: ['admin', 'saml'],
    queryFn: getSAMLConfig,
  })

  useEffect(() => {
    if (saml) {
      setMetadataURL(saml.metadata_url)
      setCertPEM(saml.cert_pem)
    }
  }, [saml])

  function readFile(file: File, setter: (v: string) => void) {
    const reader = new FileReader()
    reader.onload = (e) => setter((e.target?.result as string) ?? '')
    reader.readAsText(file)
  }

  const saveMutation = useMutation({
    mutationFn: () => saveSAMLConfig({ metadata_url: metadataURL, cert_pem: certPEM, key_pem: keyPEM }),
    onSuccess: (res) => {
      setSaved(true)
      setSaveError('')
      setWarning(res.warning ?? '')
      setTimeout(() => setSaved(false), 3000)
      qc.invalidateQueries({ queryKey: ['admin', 'saml'] })
    },
    onError: (err) => setSaveError(extractError(err)),
  })

  const { t } = useT()

  if (isLoading) return <div className="py-4 text-center text-sm text-gray-400">{t('settings.saml.loading')}</div>

  const spMetadataURL = saml?.sp_metadata_url ?? ''

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          saml?.configured ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
        )}>
          {saml?.configured ? t('settings.saml.configured') : t('settings.saml.not_configured')}
        </span>
        {saml?.configured && (
          <span className="text-xs text-gray-500">
            {t('settings.saml.sp_metadata_prefix')}{' '}
            <button
              className="font-mono text-blue-600 underline decoration-dotted hover:decoration-solid"
              onClick={() => navigator.clipboard.writeText(spMetadataURL)}
              title={t('settings.saml.copy_clipboard')}
            >
              {spMetadataURL}
            </button>
          </span>
        )}
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">{t('settings.saml.idp_metadata_url')}</label>
        <Input
          placeholder="https://idp.example.com/saml/metadata"
          value={metadataURL}
          onChange={(e) => setMetadataURL(e.target.value)}
          className="max-w-lg font-mono text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          {t('settings.saml.sp_cert')}
          {saml?.configured && !certPEM && <span className="ml-2 text-xs font-normal text-gray-400">{t('settings.saml.already_configured')}</span>}
        </label>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => certFileRef.current?.click()}>{t('settings.saml.upload_pem_crt')}</Button>
          {certPEM && <span className="text-xs text-gray-500 truncate max-w-xs font-mono">{certPEM.split('\n')[0]}…</span>}
        </div>
        <input ref={certFileRef} type="file" accept=".pem,.crt,.cer" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, setCertPEM) }} />
        {certPEM && (
          <textarea rows={4}
            className="mt-1 w-full max-w-lg rounded border border-gray-300 p-2 font-mono text-xs text-gray-600"
            value={certPEM} onChange={(e) => setCertPEM(e.target.value)} />
        )}
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          {t('settings.saml.sp_key')}
          {saml?.configured && !keyPEM && <span className="ml-2 text-xs font-normal text-gray-400">{t('settings.saml.already_configured_replace')}</span>}
        </label>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => keyFileRef.current?.click()}>{t('settings.saml.upload_pem_key')}</Button>
          {keyPEM && <span className="text-xs text-gray-500 font-mono">{keyPEM.split('\n')[0]}…</span>}
        </div>
        <input ref={keyFileRef} type="file" accept=".pem,.key" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, setKeyPEM) }} />
        {keyPEM && (
          <textarea rows={4}
            className="mt-1 w-full max-w-lg rounded border border-gray-300 p-2 font-mono text-xs text-gray-600"
            value={keyPEM} onChange={(e) => setKeyPEM(e.target.value)} />
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? t('settings.saving') : t('settings.saml.save_config')}
        </Button>
        {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        {saved && !warning && <p className="text-sm text-green-600">{t('settings.saml.config_saved')}</p>}
        {warning && <p className="text-sm text-amber-600">{warning}</p>}
      </div>
    </div>
  )
}

// ── Tab definitions ───────────────────────────────────────────────────────────

type Tab = 'general' | 'branding' | 'auth' | 'email' | 'features' | 'whatsapp'

const TABS: { id: Tab; label: string }[] = [
  { id: 'general',  label: 'General' },
  { id: 'branding', label: 'Branding' },
  { id: 'auth',     label: 'Authentication' },
  { id: 'email',    label: 'Email Settings' },
  { id: 'features', label: 'Features' },
  { id: 'whatsapp', label: 'WhatsApp Integration' },
]

// ── Tab panels ────────────────────────────────────────────────────────────────

function GeneralPanel({
  bool, num, str,
  setBool, setNum, setStr,
  onSave, isPending, error, saved,
}: {
  bool: (k: string) => boolean
  num: (k: string) => number
  str: (k: string) => string
  setBool: (k: string, v: boolean) => void
  setNum: (k: string, v: number) => void
  setStr: (k: string, v: string) => void
  onSave: () => void
  isPending: boolean
  error: string
  saved: boolean
}) {
  const { t } = useT()
  const { data: statuses = [] } = useQuery({ queryKey: ['statuses'], queryFn: listStatuses })
  // Reopen target should be an active, non-system status (not Resolved/Closed).
  const targetableStatuses = statuses.filter((s) => s.active && s.kind !== 'system')

  return (
    <div className="space-y-6">
      <Section title={t('settings.general.submissions')}>
        <SettingRow
          label={t('settings.general.guest_submission')}
          description={t('settings.general.guest_submission_desc')}
        >
          <Toggle checked={bool('guest_submission_enabled')} onChange={(v) => setBool('guest_submission_enabled', v)} />
        </SettingRow>
      </Section>

      <Section title={t('settings.general.ticket_lifecycle')}>
        <SettingRow
          label={t('settings.general.reopen_window')}
          description={t('settings.general.reopen_window_desc')}
        >
          <div className="flex items-center gap-2">
            <Input
              type="number" min={0} className="w-20 text-right"
              value={num('reopen_window_days')}
              onChange={(e) => setNum('reopen_window_days', Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
            <span className="text-sm text-gray-500">{t('settings.general.days')}</span>
          </div>
        </SettingRow>
        <SettingRow
          label={t('settings.general.reopen_target_status')}
          description={t('settings.general.reopen_target_status_desc')}
        >
          <Select
            className="w-44"
            value={str('reopen_target_status_name')}
            onChange={(e) => setStr('reopen_target_status_name', e.target.value)}
          >
            <option value="">{t('settings.select')}</option>
            {targetableStatuses.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </Select>
        </SettingRow>
      </Section>

      <SaveBar onSave={onSave} isPending={isPending} error={error} saved={saved} />
    </div>
  )
}

function BrandingPanel({
  str, setStr,
  onSave, isPending, error, saved,
}: {
  str: (k: string) => string
  setStr: (k: string, v: string) => void
  onSave: () => void
  isPending: boolean
  error: string
  saved: boolean
}) {
  const { t } = useT()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputDarkRef = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState('')
  const [logoDarkError, setLogoDarkError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadingDark, setUploadingDark] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletingDark, setDeletingDark] = useState(false)
  const [confirmDeleteLogo, setConfirmDeleteLogo] = useState(false)
  const [confirmDeleteLogoDark, setConfirmDeleteLogoDark] = useState(false)
  const [logoKey, setLogoKey] = useState(0)
  const [logoDarkKey, setLogoDarkKey] = useState(0)

  const { data: siteConfig } = useQuery({ queryKey: ['site-config'], queryFn: getSiteConfig })
  const currentLogoURL = siteConfig?.logo_url ?? ''
  const currentLogoDarkURL = siteConfig?.logo_dark_url ?? ''

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoError('')
    setUploading(true)
    try {
      await uploadLogo(file)
      setLogoKey((k) => k + 1)
      qc.invalidateQueries({ queryKey: ['site-config'] })
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
    } catch (err) {
      setLogoError(extractError(err))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDeleteLogo() {
    setLogoError('')
    setDeleting(true)
    try {
      await deleteLogo()
      setLogoKey((k) => k + 1)
      qc.invalidateQueries({ queryKey: ['site-config'] })
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
      setConfirmDeleteLogo(false)
    } catch (err) {
      setLogoError(extractError(err))
    } finally {
      setDeleting(false)
    }
  }

  async function handleFileChangeDark(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoDarkError('')
    setUploadingDark(true)
    try {
      await uploadLogoDark(file)
      setLogoDarkKey((k) => k + 1)
      qc.invalidateQueries({ queryKey: ['site-config'] })
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
    } catch (err) {
      setLogoDarkError(extractError(err))
    } finally {
      setUploadingDark(false)
      if (fileInputDarkRef.current) fileInputDarkRef.current.value = ''
    }
  }

  async function handleDeleteLogoDark() {
    setLogoDarkError('')
    setDeletingDark(true)
    try {
      await deleteLogoDark()
      setLogoDarkKey((k) => k + 1)
      qc.invalidateQueries({ queryKey: ['site-config'] })
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
      setConfirmDeleteLogoDark(false)
    } catch (err) {
      setLogoDarkError(extractError(err))
    } finally {
      setDeletingDark(false)
    }
  }

  return (
    <div className="space-y-6">
      <Section title={t('settings.branding.identity')}>
        <SettingRow
          label={t('settings.branding.site_name')}
          description={t('settings.branding.site_name_desc')}
        >
          <Input
            className="w-56"
            placeholder="Go Help Desk"
            value={str('site_name')}
            onChange={(e) => setStr('site_name', e.target.value)}
          />
        </SettingRow>

        <div className="px-5 py-5 space-y-6">
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('settings.branding.system_logos')}</div>
            <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {t('settings.branding.system_logos_desc')}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Logo Modo Claro */}
            <div className="rounded-lg border border-gray-200 dark:border-neutral-800 p-4 bg-gray-50 dark:bg-neutral-900/50 space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('settings.branding.light_mode')}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings.branding.light_mode_desc')}</p>
              </div>

              <div className="h-20 flex items-center justify-center rounded border border-gray-200 bg-white p-2">
                {currentLogoURL ? (
                  <img
                    src={`${currentLogoURL}?v=${logoKey}`}
                    alt="Logo Claro"
                    className="h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-gray-400 italic">{t('settings.branding.no_logo_site_name')}</span>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || deleting}
                >
                  {uploading ? t('common.uploading') : currentLogoURL ? t('settings.branding.replace') : t('settings.branding.upload_logo')}
                </Button>
                {currentLogoURL && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                    onClick={() => setConfirmDeleteLogo(true)}
                    disabled={deleting || uploading}
                  >
                    {deleting ? t('settings.branding.removing') : t('settings.branding.remove')}
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.gif,.svg"
                className="hidden"
                onChange={handleFileChange}
              />
              {logoError && <p className="text-xs text-red-600 dark:text-red-400">{logoError}</p>}
            </div>

            {/* Logo Modo Escuro */}
            <div className="rounded-lg border border-gray-200 dark:border-neutral-800 p-4 bg-gray-50 dark:bg-neutral-900/50 space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('settings.branding.dark_mode')}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings.branding.dark_mode_desc')}</p>
              </div>

              <div className="h-20 flex items-center justify-center rounded border border-neutral-700 bg-neutral-950 p-2">
                {currentLogoDarkURL ? (
                  <img
                    src={`${currentLogoDarkURL}?v=${logoDarkKey}`}
                    alt="Logo Escuro"
                    className="h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-neutral-500 italic">{t('settings.branding.no_logo_dark_fallback')}</span>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputDarkRef.current?.click()}
                  disabled={uploadingDark || deletingDark}
                >
                  {uploadingDark ? t('common.uploading') : currentLogoDarkURL ? t('settings.branding.replace') : t('settings.branding.upload_logo')}
                </Button>
                {currentLogoDarkURL && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                    onClick={() => setConfirmDeleteLogoDark(true)}
                    disabled={deletingDark || uploadingDark}
                  >
                    {deletingDark ? t('settings.branding.removing') : t('settings.branding.remove')}
                  </Button>
                )}
              </div>
              <input
                ref={fileInputDarkRef}
                type="file"
                accept=".png,.jpg,.jpeg,.gif,.svg"
                className="hidden"
                onChange={handleFileChangeDark}
              />
              {logoDarkError && <p className="text-xs text-red-600 dark:text-red-400">{logoDarkError}</p>}
            </div>
          </div>

          <ConfirmDialog
            open={confirmDeleteLogo}
            onOpenChange={setConfirmDeleteLogo}
            title={t('settings.branding.remove_light_title')}
            description={t('settings.branding.remove_light_desc')}
            confirmLabel={t('settings.branding.remove')}
            isPending={deleting}
            onConfirm={handleDeleteLogo}
          />
          <ConfirmDialog
            open={confirmDeleteLogoDark}
            onOpenChange={setConfirmDeleteLogoDark}
            title={t('settings.branding.remove_dark_title')}
            description={t('settings.branding.remove_dark_desc')}
            confirmLabel={t('settings.branding.remove')}
            isPending={deletingDark}
            onConfirm={handleDeleteLogoDark}
          />
        </div>
      </Section>

      <SaveBar onSave={onSave} isPending={isPending} error={error} saved={saved} />
    </div>
  )
}

function AuthPanel({
  bool, strArr,
  setBool, toggleStrArr, setStrArr,
  onSave, isPending, error, saved,
}: {
  bool: (k: string) => boolean
  strArr: (k: string) => string[]
  setBool: (k: string, v: boolean) => void
  toggleStrArr: (k: string, item: string, checked: boolean) => void
  setStrArr: (k: string, v: string[]) => void
  onSave: () => void
  isPending: boolean
  error: string
  saved: boolean
}) {
  const { t } = useT()
  const [confirmOpenReg, setConfirmOpenReg] = useState(false)

  const domainsLocked = strArr('allowed_email_domains').length > 0

  return (
    <div className="space-y-6">
      <Section title={t('settings.auth.saml')}>
        <div>
          <SettingRow
            label={t('settings.auth.saml_enable')}
            description={t('settings.auth.saml_enable_desc')}
          >
            <Toggle checked={bool('saml_enabled')} onChange={(v) => setBool('saml_enabled', v)} />
          </SettingRow>
          {bool('saml_enabled') && (
            <div className="border-t bg-gray-50">
              <div className="px-5 pt-3 pb-0">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{t('settings.auth.saml_config')}</p>
              </div>
              <SAMLSection />
            </div>
          )}
        </div>
      </Section>

      <Section title={t('settings.auth.mfa')}>
        <SettingRow
          label={t('settings.auth.mfa_enable')}
          description={t('settings.auth.mfa_enable_desc')}
        >
          <Toggle checked={bool('mfa_enabled')} onChange={(v) => setBool('mfa_enabled', v)} />
        </SettingRow>
        {bool('mfa_enabled') && (
          <SettingRow
            label={t('settings.auth.mfa_require')}
            description={t('settings.auth.mfa_require_desc')}
          >
            <div className="flex gap-4">
              {(['admin', 'staff', 'user'] as const).map((r) => (
                <label key={r} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={strArr('mfa_enforced_roles').includes(r)}
                    onChange={(e) => toggleStrArr('mfa_enforced_roles', r, e.target.checked)}
                  />
                  <span className="text-sm capitalize text-gray-700">{r}</span>
                </label>
              ))}
            </div>
          </SettingRow>
        )}
      </Section>

      <Section title={t('settings.auth.registration')}>
        <SettingRow
          label={t('settings.auth.self_signup')}
          description={t('settings.auth.self_signup_desc')}
        >
          <Toggle checked={bool('self_signup_enabled')} onChange={(v) => setBool('self_signup_enabled', v)} />
        </SettingRow>
        {bool('self_signup_enabled') && (
          <>
            <div className="border-t px-5 py-4 space-y-2">
              <div className="text-sm font-medium text-gray-900">{t('settings.auth.allowed_domains')}</div>
              <div className="text-sm text-gray-500">
                {t('settings.auth.allowed_domains_desc')}
              </div>
              <textarea
                rows={3}
                className="w-full max-w-xs rounded border border-gray-300 p-2 font-mono text-sm"
                placeholder={'company.com\nexample.org'}
                value={strArr('allowed_email_domains').join('\n')}
                onChange={(e) =>
                  setStrArr(
                    'allowed_email_domains',
                    e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                  )
                }
              />
            </div>
            <SettingRow
              label={t('settings.auth.open_reg')}
              description={
                domainsLocked
                  ? t('settings.auth.open_reg_desc')
                  : t('settings.auth.open_reg_desc_active')
              }
            >
              <Toggle
                checked={bool('open_registration_enabled')}
                onChange={(v) => {
                  if (!v) { setBool('open_registration_enabled', false); return }
                  setConfirmOpenReg(true)
                }}
              />
            </SettingRow>
            <ConfirmDialog
              open={confirmOpenReg}
              onOpenChange={setConfirmOpenReg}
              title={t('settings.auth.confirm_open_reg_title')}
              description={t('settings.auth.confirm_open_reg_desc')}
              confirmLabel={t('settings.auth.confirm_open_reg_action')}
              onConfirm={() => { setBool('open_registration_enabled', true); setConfirmOpenReg(false) }}
            />
          </>
        )}
      </Section>

      <SaveBar onSave={onSave} isPending={isPending} error={error} saved={saved} />
    </div>
  )
}

// ── SLA policies blade ────────────────────────────────────────────────────────

const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-700',
}

function fmtMin(m: number) {
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

type PolicyForm = {
  name: string
  priority: string
  category_id: string
  response_target_min: number
  resolution_target_min: number
}

const EMPTY_FORM: PolicyForm = {
  name: '',
  priority: 'medium',
  category_id: '',
  response_target_min: 480,
  resolution_target_min: 2880,
}

function PolicyFormRow({
  form, setForm, categories, onSave, onCancel, isPending,
}: {
  form: PolicyForm
  setForm: React.Dispatch<React.SetStateAction<PolicyForm>>
  categories: { id: string; name: string; active: boolean }[]
  onSave: () => void
  onCancel: () => void
  isPending: boolean
}) {
  const { t } = useT()
  return (
    <tr className="bg-blue-50 dark:bg-blue-950/20">
      <td className="px-3 py-2">
        <Input
          className="h-7 text-sm w-full min-w-[130px]"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder={t('settings.sla.policy_name_placeholder')}
        />
      </td>
      <td className="px-3 py-2">
        <Select
          className="h-7 text-sm w-full min-w-[100px]"
          value={form.priority}
          onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p} className="capitalize">{p}</option>
          ))}
        </Select>
      </td>
      <td className="px-3 py-2">
        <Select
          className="h-7 text-sm w-full min-w-[130px]"
          value={form.category_id}
          onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
        >
          <option value="">{t('settings.sla.all_categories')}</option>
          {categories.filter((c) => c.active).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <Input
            type="number" min={1} className="h-7 w-20 text-sm"
            value={form.response_target_min}
            onChange={(e) => setForm((f) => ({ ...f, response_target_min: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
          />
          <span className="text-xs text-gray-400">{t('settings.sla.minutes_abbr')}</span>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <Input
            type="number" min={1} className="h-7 w-20 text-sm"
            value={form.resolution_target_min}
            onChange={(e) => setForm((f) => ({ ...f, resolution_target_min: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
          />
          <span className="text-xs text-gray-400">{t('settings.sla.minutes_abbr')}</span>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2 min-w-[125px]">
          <Button size="sm" onClick={onSave} disabled={isPending}>{t('common.save')}</Button>
          <Button size="sm" variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
        </div>
      </td>
    </tr>
  )
}

function SLAPoliciesSection() {
  const { t } = useT()
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SLAPolicy | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<PolicyForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const { data: policies = [] } = useQuery({ queryKey: ['sla-policies'], queryFn: listSLAPolicies })
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: listCategories })

  function startEdit(p: SLAPolicy) {
    setEditingId(p.id)
    setShowAdd(false)
    setFormError('')
    setForm({
      name: p.name,
      priority: p.priority,
      category_id: p.category_id ?? '',
      response_target_min: p.response_target_min,
      resolution_target_min: p.resolution_target_min,
    })
  }

  function startAdd() {
    setShowAdd(true)
    setEditingId(null)
    setFormError('')
    setForm(EMPTY_FORM)
  }

  const createMutation = useMutation({
    mutationFn: () => createSLAPolicy({
      name: form.name,
      priority: form.priority,
      category_id: form.category_id || undefined,
      response_target_min: form.response_target_min,
      resolution_target_min: form.resolution_target_min,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla-policies'] })
      setShowAdd(false)
      setForm(EMPTY_FORM)
    },
    onError: (err) => setFormError(extractError(err)),
  })

  const updateMutation = useMutation({
    mutationFn: (id: string) => updateSLAPolicy(id, {
      name: form.name,
      priority: form.priority,
      category_id: form.category_id || undefined,
      clear_category: !form.category_id,
      response_target_min: form.response_target_min,
      resolution_target_min: form.resolution_target_min,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla-policies'] })
      setEditingId(null)
    },
    onError: (err) => setFormError(extractError(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSLAPolicy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla-policies'] })
      setPendingDelete(null)
    },
  })

  const showTable = policies.length > 0 || showAdd

  return (
    <div className="border-t bg-gray-50">
      <div className="px-5 pt-3 pb-0">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{t('settings.sla.policies_title')}</p>
      </div>
      <div className="px-5 py-4 space-y-3">
        {showTable ? (
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a]">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-[#2a2a2a] bg-gray-50 dark:bg-[#0a0a0a]">
                <tr className="text-left text-xs font-medium text-gray-500">
                  <th className="px-3 py-2">{t('settings.sla.name')}</th>
                  <th className="px-3 py-2">{t('settings.sla.priority')}</th>
                  <th className="px-3 py-2">{t('settings.sla.category')}</th>
                  <th className="px-3 py-2">{t('settings.sla.response')}</th>
                  <th className="px-3 py-2">{t('settings.sla.resolution')}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {policies.map((p) =>
                  editingId === p.id ? (
                    <PolicyFormRow
                      key={p.id}
                      form={form} setForm={setForm} categories={categories}
                      onSave={() => updateMutation.mutate(p.id)}
                      onCancel={() => setEditingId(null)}
                      isPending={updateMutation.isPending}
                    />
                  ) : (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="px-3 py-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', PRIORITY_COLORS[p.priority])}>
                          {p.priority}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {p.category_id
                          ? (categories.find((c) => c.id === p.category_id)?.name ?? '—')
                          : t('settings.sla.all_categories')}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">{fmtMin(p.response_target_min)}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">{fmtMin(p.resolution_target_min)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-3">
                          <button className="text-xs text-blue-600 hover:underline" onClick={() => startEdit(p)}>{t('common.edit')}</button>
                          <button
                            className="text-xs text-red-600 hover:underline disabled:opacity-40"
                            onClick={() => setPendingDelete(p)}
                            disabled={deleteMutation.isPending}
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
                {showAdd && (
                  <PolicyFormRow
                    form={form} setForm={setForm} categories={categories}
                    onSave={() => createMutation.mutate()}
                    onCancel={() => setShowAdd(false)}
                    isPending={createMutation.isPending}
                  />
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{t('settings.sla.no_policies')}</p>
        )}
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        {!showAdd && !editingId && (
          <Button size="sm" variant="outline" onClick={startAdd}>{t('settings.sla.add_policy')}</Button>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={`${t('settings.sla.delete_title')} "${pendingDelete?.name ?? ''}"?`}
        description={t('settings.sla.delete_desc')}
        confirmLabel={t('settings.sla.delete_action')}
        isPending={deleteMutation.isPending}
        onConfirm={() => { if (pendingDelete) deleteMutation.mutate(pendingDelete.id) }}
      />
    </div>
  )
}

// ── Features panel ────────────────────────────────────────────────────────────

function FeaturesPanel({
  bool, str, setBool, setStr,
  onSave, isPending, error, saved,
}: {
  bool: (k: string) => boolean
  str: (k: string) => string
  setBool: (k: string, v: boolean) => void
  setStr: (k: string, v: string) => void
  onSave: () => void
  isPending: boolean
  error: string
  saved: boolean
}) {
  const { t } = useT()
  return (
    <div className="space-y-6">
      <Section title={t('settings.features.sla')}>
        <div>
          <SettingRow
            label={t('settings.features.sla_tracking')}
            description={t('settings.features.sla_tracking_desc')}
          >
            <Toggle checked={bool('sla_enabled')} onChange={(v) => setBool('sla_enabled', v)} />
          </SettingRow>
          {bool('sla_enabled') && <SLAPoliciesSection />}
        </div>
      </Section>

      <Section title={t('settings.features.itsm')}>
        <div>
          <SettingRow
            label={t('settings.features.itsm_mode')}
            description={t('settings.features.itsm_mode_desc')}
          >
            <Toggle checked={bool('itsm_enabled')} onChange={(v) => setBool('itsm_enabled', v)} />
          </SettingRow>
        </div>
      </Section>

      <Section title={t('settings.features.ai')}>
        <div>
          <SettingRow
            label={t('settings.features.gemini_key')}
            description={t('settings.features.gemini_key_desc')}
          >
            <Input
              type="password"
              className="w-56"
              placeholder={t('settings.features.gemini_key_placeholder')}
              value={str('gemini_api_key')}
              onChange={(e) => setStr('gemini_api_key', e.target.value)}
            />
          </SettingRow>
        </div>
      </Section>

      <SaveBar onSave={onSave} isPending={isPending} error={error} saved={saved} />
    </div>
  )
}

function EmailPanel({
  str, num, setStr, setNum,
  onSave, isPending, error, saved,
}: {
  str: (k: string) => string
  num: (k: string) => number
  setStr: (k: string, v: string) => void
  setNum: (k: string, v: number) => void
  onSave: () => void
  isPending: boolean
  error: string
  saved: boolean
}) {
  const { t } = useT()
  const provider = str('email_provider') || 'disabled'

  return (
    <div className="space-y-6">
      <Section title={t('settings.email.provider')}>
        <SettingRow
          label={t('settings.email.provider')}
          description={t('settings.email.provider_desc')}
        >
          <Select
            className="w-56"
            value={provider}
            onChange={(e) => setStr('email_provider', e.target.value)}
          >
            <option value="disabled">{t('settings.email.provider_disabled')}</option>
            <option value="smtp">{t('settings.email.provider_smtp')}</option>
            <option value="resend">{t('settings.email.provider_resend')}</option>
          </Select>
        </SettingRow>
      </Section>

      {provider === 'smtp' && (
        <Section title={t('settings.email.smtp_section')}>
          <SettingRow label={t('settings.email.smtp_host')}>
            <Input
              className="w-56 font-mono text-sm"
              placeholder={t('settings.email.smtp_host_placeholder')}
              value={str('email_smtp_host')}
              onChange={(e) => setStr('email_smtp_host', e.target.value)}
            />
          </SettingRow>

          <SettingRow label={t('settings.email.smtp_port')}>
            <Input
              type="number"
              className="w-56 font-mono text-sm"
              placeholder="587"
              value={num('email_smtp_port') || ''}
              onChange={(e) => setNum('email_smtp_port', parseInt(e.target.value, 10) || 0)}
            />
          </SettingRow>

          <SettingRow label={t('settings.email.smtp_user')}>
            <Input
              className="w-56 font-mono text-sm"
              placeholder={t('settings.email.smtp_user_placeholder')}
              value={str('email_smtp_user')}
              onChange={(e) => setStr('email_smtp_user', e.target.value)}
            />
          </SettingRow>

          <SettingRow label={t('settings.email.smtp_password')}>
            <Input
              type="password"
              className="w-56 font-mono text-sm"
              placeholder={t('settings.email.smtp_password_placeholder')}
              value={str('email_smtp_password')}
              onChange={(e) => setStr('email_smtp_password', e.target.value)}
            />
          </SettingRow>

          <SettingRow label={t('settings.email.smtp_from')}>
            <Input
              className="w-56 font-mono text-sm"
              placeholder={t('settings.email.smtp_from_placeholder')}
              value={str('email_smtp_from')}
              onChange={(e) => setStr('email_smtp_from', e.target.value)}
            />
          </SettingRow>
        </Section>
      )}

      {provider === 'resend' && (
        <Section title={t('settings.email.resend_section')}>
          <SettingRow label={t('settings.email.resend_api_key')}>
            <Input
              type="password"
              className="w-56 font-mono text-sm"
              placeholder={t('settings.email.resend_api_key_placeholder')}
              value={str('email_resend_api_key')}
              onChange={(e) => setStr('email_resend_api_key', e.target.value)}
            />
          </SettingRow>

          <SettingRow label={t('settings.email.resend_from')}>
            <Input
              className="w-56 font-mono text-sm"
              placeholder={t('settings.email.resend_from_placeholder')}
              value={str('email_resend_from')}
              onChange={(e) => setStr('email_resend_from', e.target.value)}
            />
          </SettingRow>
        </Section>
      )}

      <SaveBar onSave={onSave} isPending={isPending} error={error} saved={saved} />
    </div>
  )
}

function WhatsAppPanel({
  str, bool, setStr, setBool,
  onSave, isPending, error, saved,
}: {
  str: (k: string) => string
  bool: (k: string) => boolean
  setStr: (k: string, v: string) => void
  setBool: (k: string, v: boolean) => void
  onSave: () => void
  isPending: boolean
  error: string
  saved: boolean
}) {
  const { t } = useT()
  const enabled = bool('whatsapp_enabled')

  const [status, setStatus] = useState<string>('loading')
  const [whatsappNumber, setWhatsappNumber] = useState<string>('')
  const [qrCode, setQrCode] = useState<string>('')
  const [checking, setChecking] = useState<boolean>(false)

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: listCategories })
  const activeCategories = categories.filter((c) => c.active)

  const menuConfigStr = str('whatsapp_menu_config')

  // Parse do JSON para um array editável
  const rows: { option: string; categoryId: string }[] = (() => {
    try {
      const parsed = menuConfigStr ? JSON.parse(menuConfigStr) : {}
      return Object.entries(parsed).map(([option, categoryId]) => ({
        option,
        categoryId: String(categoryId),
      }))
    } catch (e) {
      return []
    }
  })()

  const updateRows = (newRows: { option: string; categoryId: string }[]) => {
    const obj: Record<string, string> = {}
    newRows.forEach((r) => {
      const opt = r.option.trim()
      if (opt) {
        obj[opt] = r.categoryId
      }
    })
    setStr('whatsapp_menu_config', JSON.stringify(obj))
  }

  const handleAddRow = () => {
    const defaultCatId = activeCategories[0]?.id || ''
    let nextOpt = 1
    while (rows.some((r) => r.option === String(nextOpt))) {
      nextOpt++
    }
    const newRows = [...rows, { option: String(nextOpt), categoryId: defaultCatId }]
    updateRows(newRows)
  }

  const handleRowChange = (index: number, field: 'option' | 'categoryId', value: string) => {
    const newRows = [...rows]
    newRows[index] = { ...newRows[index], [field]: value }
    updateRows(newRows)
  }

  const handleRemoveRow = (index: number) => {
    const newRows = rows.filter((_, i) => i !== index)
    updateRows(newRows)
  }

  const checkStatus = async () => {
    setChecking(true)
    try {
      const res = await getWhatsAppStatus()
      setStatus(res.status)
      setWhatsappNumber(res.number || '')
      if (res.status === 'open') {
        setQrCode('')
      }
    } catch (err) {
      console.error(err)
      setStatus('error')
      setWhatsappNumber('')
    } finally {
      setChecking(false)
    }
  }

  const loadQRCode = async () => {
    try {
      setStatus('connecting')
      const res = await getWhatsAppQRCode()
      setQrCode(res.qrcode)
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  useEffect(() => {
    checkStatus()
  }, [])

  // Poll connection status every 6 seconds if QR Code is active
  useEffect(() => {
    if (!qrCode) return
    const interval = setInterval(async () => {
      try {
        const res = await getWhatsAppStatus()
        if (res.status === 'open') {
          setStatus('open')
          setWhatsappNumber(res.number || '')
          setQrCode('')
          clearInterval(interval)
        }
      } catch (err) {
        console.error(err)
      }
    }, 6000)
    return () => clearInterval(interval)
  }, [qrCode])

  return (
    <div className="space-y-6">
      <Section title={t('settings.whatsapp.title')}>
        <SettingRow
          label={t('settings.whatsapp.enabled')}
          description={t('settings.whatsapp.subtitle')}
        >
          <Toggle checked={enabled} onChange={(v) => setBool('whatsapp_enabled', v)} />
        </SettingRow>
      </Section>

      {enabled && (
        <>
          <Section title="API Configuration">
            <SettingRow label={t('settings.whatsapp.api_url')}>
              <Input
                className="w-56 font-mono text-sm"
                placeholder={t('settings.whatsapp.api_url_placeholder')}
                value={str('whatsapp_api_url')}
                onChange={(e) => setStr('whatsapp_api_url', e.target.value)}
              />
            </SettingRow>

            <SettingRow label={t('settings.whatsapp.api_token')}>
              <Input
                type="password"
                className="w-56 font-mono text-sm"
                placeholder={t('settings.whatsapp.api_token_placeholder')}
                value={str('whatsapp_api_token')}
                onChange={(e) => setStr('whatsapp_api_token', e.target.value)}
              />
            </SettingRow>

            <SettingRow label={t('settings.whatsapp.instance_name')}>
              <Input
                className="w-56 font-mono text-sm"
                placeholder={t('settings.whatsapp.instance_name_placeholder')}
                value={str('whatsapp_instance_name')}
                onChange={(e) => setStr('whatsapp_instance_name', e.target.value)}
              />
            </SettingRow>
          </Section>

          <Section title="Device Pairing">
            <SettingRow
              label={t('settings.whatsapp.connection_status')}
              description={
                status === 'open'
                  ? t('settings.whatsapp.pair_success')
                  : status === 'connecting'
                  ? t('settings.whatsapp.connecting')
                  : t('settings.whatsapp.disconnected')
              }
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                    status === 'open'
                      ? 'bg-green-100 text-green-800'
                      : status === 'connecting'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800'
                  )}
                >
                  {status === 'open'
                    ? t('settings.whatsapp.connected')
                    : status === 'connecting'
                    ? t('settings.whatsapp.connecting')
                    : t('settings.whatsapp.disconnected')}
                </span>

                {status === 'open' && whatsappNumber && (
                  <span className="text-sm font-semibold text-white bg-gray-500 dark:bg-neutral-700 px-2 py-0.5 rounded font-mono">
                    {whatsappNumber}
                  </span>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  disabled={checking}
                  onClick={checkStatus}
                >
                  {t('settings.whatsapp.test_connection')}
                </Button>
              </div>
            </SettingRow>

            {status !== 'open' && (
              <div className="flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-[#222] border-t dark:border-[#2a2a2a]">
                {qrCode ? (
                  <div className="flex flex-col items-center space-y-4 max-w-xs text-center">
                    <p className="text-xs text-gray-500">
                      {t('settings.whatsapp.pair_instruction')}
                    </p>
                    <div className="p-4 bg-white rounded-lg shadow-inner">
                      <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48" />
                    </div>
                  </div>
                ) : (
                  <Button onClick={loadQRCode}>
                    {t('settings.whatsapp.get_qr')}
                  </Button>
                )}
              </div>
            )}
          </Section>

          <Section title={t('settings.whatsapp.chatbot_title')}>
            <SettingRow
              label={t('settings.whatsapp.chatbot_enabled')}
              description={t('settings.whatsapp.chatbot_subtitle')}
            >
              <Toggle
                checked={bool('whatsapp_chatbot_enabled')}
                onChange={(v) => setBool('whatsapp_chatbot_enabled', v)}
              />
            </SettingRow>

            {bool('whatsapp_chatbot_enabled') && (
              <>
                <div className="border-t px-5 py-4 space-y-2">
                  <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t('settings.whatsapp.welcome_message')}
                  </label>
                  <textarea
                    rows={4}
                    className="w-full rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2.5 text-sm"
                    placeholder={t('settings.whatsapp.welcome_placeholder')}
                    value={str('whatsapp_welcome_message')}
                    onChange={(e) => setStr('whatsapp_welcome_message', e.target.value)}
                  />
                </div>

                <div className="border-t px-5 py-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {t('settings.whatsapp.menu_mapping')}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('settings.whatsapp.menu_mapping_desc')}
                    </p>
                  </div>

                  {rows.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-950">
                          <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            <th className="px-4 py-2.5 w-1/4">{t('settings.whatsapp.option_num')}</th>
                            <th className="px-4 py-2.5 w-1/2">{t('settings.whatsapp.option_category')}</th>
                            <th className="px-4 py-2.5 w-1/4"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-neutral-800">
                          {rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-neutral-900/50">
                              <td className="px-4 py-2">
                                <Input
                                  className="h-8 text-sm max-w-[80px] font-medium"
                                  value={row.option}
                                  onChange={(e) => handleRowChange(idx, 'option', e.target.value)}
                                  placeholder="ex: 1"
                                />
                              </td>
                              <td className="px-4 py-2">
                                <Select
                                  className="h-8 text-sm w-full"
                                  value={row.categoryId}
                                  onChange={(e) => handleRowChange(idx, 'categoryId', e.target.value)}
                                >
                                  <option value="">{t('settings.select')}</option>
                                  {activeCategories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                      {cat.name}
                                    </option>
                                  ))}
                                </Select>
                              </td>
                              <td className="px-4 py-2 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                  onClick={() => handleRemoveRow(idx)}
                                >
                                  {t('settings.whatsapp.remove_option')}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center p-6 border border-dashed rounded-lg border-gray-200 dark:border-neutral-800 text-gray-500 dark:text-gray-400 text-sm">
                      Nenhuma opção configurada. O chatbot não funcionará sem opções.
                    </div>
                  )}

                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddRow}
                    >
                      {t('settings.whatsapp.add_option')}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Section>
        </>
      )}

      <SaveBar onSave={onSave} isPending={isPending} error={error} saved={saved} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { t } = useT()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [local, setLocal] = useState<Record<string, unknown>>({})
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: getSettings,
  })

  useEffect(() => {
    if (settings) setLocal(settings)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => updateSettings(local),
    onSuccess: () => {
      setSaved(true)
      setSaveError('')
      setTimeout(() => setSaved(false), 2500)
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
      qc.invalidateQueries({ queryKey: ['site-config'] })
    },
    onError: (err) => setSaveError(extractError(err)),
  })

  function bool(key: string) { return Boolean(local[key]) }
  function num(key: string) { return Number(local[key] ?? 0) }
  function str(key: string) { return String(local[key] ?? '') }
  function strArr(key: string): string[] {
    const v = local[key]
    if (Array.isArray(v)) return v as string[]
    if (typeof v === 'string' && v) return v.split(',').map((s) => s.trim()).filter(Boolean)
    return []
  }
  function setBool(key: string, v: boolean) { setLocal((s) => ({ ...s, [key]: v })) }
  function setNum(key: string, v: number) { setLocal((s) => ({ ...s, [key]: v })) }
  function setStr(key: string, v: string) { setLocal((s) => ({ ...s, [key]: v })) }
  function setStrArr(key: string, v: string[]) { setLocal((s) => ({ ...s, [key]: v })) }
  function toggleStrArr(key: string, item: string, checked: boolean) {
    setLocal((s) => {
      const current = strArr(key)
      const next = checked ? [...new Set([...current, item])] : current.filter((x) => x !== item)
      return { ...s, [key]: next }
    })
  }

  const panelProps = {
    bool, num, str, strArr,
    setBool, setNum, setStr, setStrArr, toggleStrArr,
    onSave: () => saveMutation.mutate(),
    isPending: saveMutation.isPending,
    error: saveError,
    saved,
  }

  if (isLoading) {
    return <Layout><div className="flex justify-center py-12"><Spinner /></div></Layout>
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('settings.subtitle')}</p>
        </div>

        {/* Tab bar */}
        <div className="border-b">
          <nav className="-mb-px flex gap-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'border-b-2 pb-3 text-sm font-medium whitespace-nowrap transition-colors',
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                )}
              >
                {t(`settings.tabs.${tab.id}` as any)}
              </button>
            ))}
          </nav>
        </div>

        {/* Active panel */}
        <div className="max-w-2xl">
          {activeTab === 'general'  && <GeneralPanel  {...panelProps} />}
          {activeTab === 'branding' && <BrandingPanel {...panelProps} />}
          {activeTab === 'auth'     && <AuthPanel     {...panelProps} />}
          {activeTab === 'email'    && <EmailPanel    {...panelProps} />}
          {activeTab === 'features' && <FeaturesPanel {...panelProps} />}
          {activeTab === 'whatsapp' && <WhatsAppPanel {...panelProps} />}
        </div>
      </div>
    </Layout>
  )
}

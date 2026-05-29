import { useState, useRef } from 'react'
import { useAuthStore } from '@/store/auth'
import { useT } from '@/i18n'
import { Layout } from '@/components/Layout'
import { updatePassword, uploadAvatar } from '@/api/auth'
import { extractError } from '@/api/client'
import { Camera, Lock, CheckCircle, ShieldAlert, Loader2 } from 'lucide-react'

export function ProfilePage() {
  const { user, setUser } = useAuthStore()
  const { t } = useT()

  // Password state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passError, setPassError] = useState('')
  const [passSuccess, setPassSuccess] = useState('')
  const [passLoading, setPassLoading] = useState(false)

  // Avatar state
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  if (!user) return null

  // Generate Initials
  const getInitials = (name: string) => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPassError('')
    setPassSuccess('')

    if (newPassword.length < 8) {
      setPassError(t('profile.password_min'))
      return
    }

    if (newPassword !== confirmPassword) {
      setPassError(t('profile.password_match'))
      return
    }

    setPassLoading(true)
    try {
      await updatePassword(newPassword)
      setPassSuccess(t('profile.password_success'))
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPassError(extractError(err))
    } finally {
      setPassLoading(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      await uploadProfilePicture(files[0])
    }
  }

  const uploadProfilePicture = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError(t('profile.avatar_error') + ': Max 2MB')
      return
    }

    setAvatarError('')
    setAvatarLoading(true)
    try {
      const data = await uploadAvatar(file)
      // Force refreshing the image in the DOM by adding a timestamp
      const freshUrl = `${data.avatar_url}?t=${Date.now()}`
      setUser({ ...user, avatar_url: freshUrl })
    } catch (err) {
      setAvatarError(extractError(err))
    } finally {
      setAvatarLoading(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (files && files[0]) {
      await uploadProfilePicture(files[0])
    }
  }

  const triggerFileSelect = () => {
    fileInputRef.current?.click()
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-neutral-800 pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {t('profile.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">
            {user.display_name} ({user.email}) · <span className="capitalize font-semibold text-blue-600 dark:text-yellow-400">{user.role}</span>
          </p>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Avatar Settings */}
          <div className="md:col-span-1 border border-gray-200 dark:border-neutral-800 bg-white/40 dark:bg-[#121212]/40 backdrop-blur-md p-6 rounded-xl flex flex-col items-center">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400 mb-6 w-full text-center">
              {t('profile.avatar_title')}
            </h2>

            {/* Avatar Dropzone Wrapper */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={triggerFileSelect}
              className={`relative group h-36 w-36 rounded-full flex items-center justify-center overflow-hidden border-2 cursor-pointer transition-all duration-300 ${
                isDragOver
                  ? 'border-blue-500 dark:border-yellow-400 bg-blue-500/10 dark:bg-yellow-400/10 scale-105'
                  : 'border-gray-200 dark:border-neutral-800 hover:border-blue-500 dark:hover:border-yellow-400 shadow-md'
              }`}
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.display_name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-3xl font-extrabold bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-yellow-400 dark:to-yellow-600 text-white dark:text-neutral-950">
                  {getInitials(user.display_name)}
                </div>
              )}

              {/* Upload Overlay */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity duration-200 text-xs font-semibold gap-1">
                <Camera className="h-5 w-5" />
                <span>Upload</span>
              </div>

              {/* Loading Spinner */}
              {avatarLoading && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-400 dark:text-yellow-400" />
                </div>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png, image/jpeg, image/jpg"
              className="hidden"
            />

            <p className="text-[11px] text-center text-gray-500 dark:text-neutral-400 mt-4 leading-relaxed max-w-[200px]">
              {t('profile.avatar_instruction')}
            </p>

            {avatarError && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 mt-3 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20 max-w-full truncate">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>{avatarError}</span>
              </div>
            )}
          </div>

          {/* Password Settings */}
          <div className="md:col-span-2 border border-gray-200 dark:border-neutral-800 bg-white/40 dark:bg-[#121212]/40 backdrop-blur-md p-6 rounded-xl">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400 mb-6 flex items-center gap-2">
              <Lock className="h-4 w-4 text-blue-600 dark:text-yellow-400" />
              {t('profile.change_password')}
            </h2>

            <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wider">
                  {t('profile.new_password')}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 focus:border-blue-500 dark:focus:border-yellow-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-yellow-400/20 rounded-lg outline-none text-sm text-gray-800 dark:text-white transition-all duration-200"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wider">
                  {t('profile.confirm_password')}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 focus:border-blue-500 dark:focus:border-yellow-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-yellow-400/20 rounded-lg outline-none text-sm text-gray-800 dark:text-white transition-all duration-200"
                />
              </div>

              {/* Feedbacks */}
              {passError && (
                <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>{passError}</span>
                </div>
              )}

              {passSuccess && (
                <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-2 rounded-lg border border-green-500/20">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>{passSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={passLoading || !newPassword || !confirmPassword}
                className="bg-blue-600 hover:bg-blue-700 dark:bg-yellow-400 dark:hover:bg-yellow-500 text-white dark:text-neutral-950 font-semibold py-2 px-4 rounded-lg shadow-lg hover:shadow-blue-500/10 dark:hover:shadow-yellow-500/15 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {passLoading && <Loader2 className="h-4 w-4 animate-spin text-current" />}
                <span>{t('profile.update_password')}</span>
              </button>
            </form>
          </div>

        </div>
      </div>
    </Layout>
  )
}

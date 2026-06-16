import { useState, useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { Bell, Check, Trash2 } from 'lucide-react'
import { useNotificationStore } from '@/store/notifications'
import { useT } from '@/i18n'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SOUND_URL = '/notification.mp3'

interface NotificationBellProps {
  /** Height/width of the trigger button — matches the neighbouring theme toggle. */
  size?: 'sm' | 'md'
}

export function NotificationBell({ size = 'md' }: NotificationBellProps) {
  const { t } = useT()
  const notifications = useNotificationStore((s) => s.notifications)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const clear = useNotificationStore((s) => s.clear)

  const [open, setOpen] = useState(false)
  const unread = notifications.filter((n) => !n.read).length

  // Play the notification sound whenever a brand-new notification arrives.
  // We seed the ref on mount so pre-existing notifications stay silent.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastTopId = useRef<string | undefined>(undefined)
  const seeded = useRef(false)
  useEffect(() => {
    const topId = notifications[0]?.id
    if (!seeded.current) {
      seeded.current = true
      lastTopId.current = topId
      return
    }
    if (topId && topId !== lastTopId.current) {
      lastTopId.current = topId
      if (!audioRef.current) audioRef.current = new Audio(SOUND_URL)
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {
        // Autoplay may be blocked until the user interacts with the page.
      })
    }
  }, [notifications])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  const btnSize = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className={cn(btnSize, 'relative rounded-md hover:bg-gray-100 dark:hover:bg-[#1a1a1a] cursor-pointer')}
        onClick={(e) => { e.stopPropagation(); if (!open) markAllRead(); setOpen(!open) }}
        title={t('notifications.title')}
      >
        <Bell className={cn(iconSize, 'text-gray-600 dark:text-[#cccccc]')} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#121212] shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-neutral-800">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('notifications.title')}</span>
            {notifications.length > 0 && (
              <button
                onClick={clear}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('notifications.clear')}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-neutral-800">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-gray-400 dark:text-neutral-500">
                <Check className="h-6 w-6" />
                <span className="text-sm">{t('notifications.empty')}</span>
              </div>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  to="/tickets/$id"
                  params={{ id: n.ticketId }}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-neutral-800/60 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-blue-600 dark:text-[#faff69] truncate">{n.author || t('notifications.new_message')}</span>
                    <span className="text-[11px] text-gray-400 dark:text-neutral-500 shrink-0">
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-gray-700 dark:text-neutral-300 truncate">{n.ticketSubject}</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400 line-clamp-2">{n.preview}</p>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

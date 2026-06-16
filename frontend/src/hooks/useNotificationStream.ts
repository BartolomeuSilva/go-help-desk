import { useEffect } from 'react'
import { useNotificationStore } from '@/store/notifications'

/**
 * Subscribes to the per-user notification stream (SSE) for the whole session.
 * Mounted once by the app shell so in-app notifications arrive on any page,
 * not only on a ticket's detail view.
 */
export function useNotificationStream(enabled: boolean) {
  const add = useNotificationStore((s) => s.add)

  useEffect(() => {
    if (!enabled) return

    const es = new EventSource('/api/v1/notifications/stream', { withCredentials: true })

    const handle = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data)
        add({
          id: d.reply_id,
          ticketId: d.ticket_id,
          ticketSubject: d.ticket_subject,
          author: d.author ?? '',
          preview: d.preview ?? '',
          createdAt: d.created_at,
        })
      } catch {
        // Ignore malformed payloads.
      }
    }

    es.addEventListener('notification', handle)

    return () => {
      es.removeEventListener('notification', handle)
      es.close()
    }
  }, [enabled, add])
}

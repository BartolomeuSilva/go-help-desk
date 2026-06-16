/**
 * Notification store — Go Help Desk
 * Holds in-app notifications shown in the top bar bell.
 * A notification is pushed whenever a new message (reply) arrives on a
 * ticket the user is viewing — from either the customer or the support side.
 */
import { create } from 'zustand'

export interface AppNotification {
  id: string          // reply id — used for de-duplication
  ticketId: string
  ticketSubject: string
  author: string
  preview: string
  createdAt: string
  read: boolean
}

const MAX_NOTIFICATIONS = 50

interface NotificationState {
  notifications: AppNotification[]
  add: (n: Omit<AppNotification, 'read'>) => void
  markAllRead: () => void
  remove: (id: string) => void
  clear: () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  add: (n) =>
    set((state) => {
      if (state.notifications.some((x) => x.id === n.id)) return state
      const next = [{ ...n, read: false }, ...state.notifications]
      return { notifications: next.slice(0, MAX_NOTIFICATIONS) }
    }),
  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),
  remove: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
  clear: () => set({ notifications: [] }),
}))

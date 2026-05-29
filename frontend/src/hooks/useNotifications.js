import { useCallback, useEffect, useState } from 'react'
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationService'

export function useUnreadNotificationCount(organizationId, userId, enabled = true) {
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!enabled || !organizationId) {
      setCount(0)
      return
    }
    const { count: n } = await fetchUnreadCount(organizationId, userId)
    setCount(n)
  }, [organizationId, userId, enabled])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 30000)
    return () => window.clearInterval(id)
  }, [refresh])

  return { count, refresh }
}

export function useNotifications(organizationId, userId) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!organizationId) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await fetchNotifications(organizationId, userId)
    setLoading(false)
    if (err) {
      setError(err.message)
      setItems([])
      return
    }
    setItems(data)
  }, [organizationId, userId])

  useEffect(() => {
    void load()
  }, [load])

  const markRead = useCallback(
    async (notificationId) => {
      const { error: err } = await markNotificationRead(notificationId, organizationId)
      if (!err) {
        setItems((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)),
        )
      }
      return { error: err }
    },
    [organizationId],
  )

  const markAllRead = useCallback(async () => {
    const { error: err } = await markAllNotificationsRead(organizationId, userId)
    if (!err) {
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    }
    return { error: err }
  }, [organizationId, userId])

  return { items, loading, error, reload: load, markRead, markAllRead }
}

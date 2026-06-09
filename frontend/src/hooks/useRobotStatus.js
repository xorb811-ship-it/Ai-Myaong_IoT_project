import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/api'

export function useRobotStatus(intervalMs = 2000) {
  const [status, setStatus] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await api.getDashboard()
      setDashboard(data)
      setStatus(data.status)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs, refresh])

  return { status, dashboard, error, loading, refresh }
}

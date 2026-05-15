'use client'

import { useState, useCallback, useEffect } from 'react'
import { fetchMonthlyInsights, type MonthlyInsights } from '@/lib/api/insights'

export type { MonthlyInsights }

export function useInsights(token?: string) {
  const [insights, setInsights] = useState<MonthlyInsights | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getToken = useCallback((): string | null => {
    if (token) return token
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem('mony_tokens')
    if (!raw) return null
    try { return JSON.parse(raw).access_token ?? null } catch { return null }
  }, [token])

  const load = useCallback(async () => {
    const t = getToken()
    if (!t) return
    setLoading(true)
    setError(null)
    try {
      setInsights(await fetchMonthlyInsights(t))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar insights')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => { load() }, [load])

  const anomalyCount = insights?.anomalies.length ?? 0

  return { insights, loading, error, load, anomalyCount }
}

'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  fetchGoals,
  createGoal,
  updateGoal,
  depositToGoal,
  deleteGoal,
  type Goal,
  type GoalCreateInput,
  type GoalUpdateInput,
} from '@/lib/api/goals'

export type { Goal }

export function useGoals(token?: string) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getToken = useCallback((): string | null => {
    if (token) return token
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem('mony_tokens')
    if (!raw) return null
    try {
      return JSON.parse(raw).access_token ?? null
    } catch {
      return null
    }
  }, [token])

  const load = useCallback(async () => {
    const t = getToken()
    if (!t) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchGoals(t)
      setGoals(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar metas')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  const addGoal = useCallback(async (input: GoalCreateInput) => {
    const t = getToken()
    if (!t) throw new Error('Não autenticado')
    const created = await createGoal(t, input)
    setGoals((prev) => [...prev, created])
    return created
  }, [getToken])

  const editGoal = useCallback(async (id: string, input: GoalUpdateInput) => {
    const t = getToken()
    if (!t) throw new Error('Não autenticado')
    const updated = await updateGoal(t, id, input)
    setGoals((prev) => prev.map((g) => (g.id === id ? updated : g)))
    return updated
  }, [getToken])

  const deposit = useCallback(async (id: string, amount: number) => {
    const t = getToken()
    if (!t) throw new Error('Não autenticado')
    const updated = await depositToGoal(t, id, amount)
    setGoals((prev) => prev.map((g) => (g.id === id ? updated : g)))
    return updated
  }, [getToken])

  const removeGoal = useCallback(async (id: string) => {
    const t = getToken()
    if (!t) throw new Error('Não autenticado')
    await deleteGoal(t, id)
    setGoals((prev) => prev.filter((g) => g.id !== id))
  }, [getToken])

  const achievedCount = goals.filter((g) => g.is_achieved).length

  return { goals, loading, error, load, addGoal, editGoal, deposit, removeGoal, achievedCount }
}

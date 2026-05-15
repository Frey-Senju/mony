'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  fetchBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  type Budget,
  type BudgetCreateInput,
  type BudgetUpdateInput,
} from '@/lib/api/budgets'

export type { Budget }

export function useBudgets(token?: string) {
  const [budgets, setBudgets] = useState<Budget[]>([])
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
      const data = await fetchBudgets(t)
      setBudgets(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar budgets')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  const addBudget = useCallback(async (input: BudgetCreateInput) => {
    const t = getToken()
    if (!t) throw new Error('Não autenticado')
    const created = await createBudget(t, input)
    setBudgets((prev) => [...prev, created])
    return created
  }, [getToken])

  const editBudget = useCallback(async (id: string, input: BudgetUpdateInput) => {
    const t = getToken()
    if (!t) throw new Error('Não autenticado')
    const updated = await updateBudget(t, id, input)
    setBudgets((prev) => prev.map((b) => (b.id === id ? updated : b)))
    return updated
  }, [getToken])

  const removeBudget = useCallback(async (id: string) => {
    const t = getToken()
    if (!t) throw new Error('Não autenticado')
    await deleteBudget(t, id)
    setBudgets((prev) => prev.filter((b) => b.id !== id))
  }, [getToken])

  const alertCount = budgets.filter((b) => b.alert_level === 'exceeded').length

  return { budgets, loading, error, load, addBudget, editBudget, removeBudget, alertCount }
}

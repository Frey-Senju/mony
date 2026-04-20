'use client'

import { useState, useCallback, useEffect } from 'react'

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  type: 'income' | 'expense'
  amount: number
  currency: string
  description: string
  notes?: string
  transaction_date: string
  merchant_name?: string
  is_recurring: boolean
  recurring_pattern?: string
  is_reconciled: boolean
  created_at: string
  updated_at: string
}

export interface FilterState {
  accountId?: string
  type?: 'income' | 'expense'
  startDate?: string
  endDate?: string
  search?: string
  isReconciled?: 'reconciled' | 'pending'
}

export interface PaginationState {
  offset: number
  limit: number
  total: number
}

export function useTransactions(token?: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<PaginationState>({
    offset: 0,
    limit: 20,
    total: 0,
  })

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  const getAuthHeaders = useCallback(() => {
    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('mony_tokens') : null)
    console.log('[DEBUG] useTransactions.getAuthHeaders - token param:', token ? 'PROVIDED' : 'NONE', ', authToken:', authToken ? 'EXISTS' : 'MISSING')
    if (!authToken) {
      console.log('[DEBUG] useTransactions.getAuthHeaders - returning empty headers')
      return {}
    }

    try {
      const tokens = JSON.parse(authToken)
      console.log('[DEBUG] useTransactions.getAuthHeaders - parsed JSON successfully')
      return {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      }
    } catch {
      console.log('[DEBUG] useTransactions.getAuthHeaders - JSON parse failed, using token as-is')
      return {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      }
    }
  }, [token])

  const fetchTransactions = useCallback(
    async (
      filters?: FilterState,
      customOffset?: number,
      customLimit?: number
    ) => {
      const headers = getAuthHeaders()
      if (Object.keys(headers).length === 0) {
        console.log('[DEBUG] useTransactions - skipping fetch, no auth headers')
        setTransactions([])
        return
      }

      setLoading(true)
      setError(null)

      try {
        const offset = customOffset ?? pagination.offset
        const limit = customLimit ?? pagination.limit

        const queryParams = new URLSearchParams({
          offset: offset.toString(),
          limit: limit.toString(),
        })

        if (filters?.accountId) {
          queryParams.append('account_id', filters.accountId)
        }
        if (filters?.type) {
          queryParams.append('type', filters.type)
        }
        if (filters?.startDate) {
          queryParams.append('start_date', filters.startDate)
        }
        if (filters?.endDate) {
          queryParams.append('end_date', filters.endDate)
        }
        if (filters?.search) {
          queryParams.append('search', filters.search)
        }
        if (filters?.isReconciled === 'reconciled') {
          queryParams.append('is_reconciled', 'true')
        } else if (filters?.isReconciled === 'pending') {
          queryParams.append('is_reconciled', 'false')
        }

        const response = await fetch(
          `${API_URL}/transactions?${queryParams.toString()}`,
          {
            method: 'GET',
            headers: headers,
          }
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch transactions: ${response.statusText}`)
        }

        const data = await response.json()
        setTransactions(data.items)
        setPagination({
          offset,
          limit,
          total: data.total,
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao buscar transações'
        setError(message)
        setTransactions([])
      } finally {
        setLoading(false)
      }
    },
    [pagination.offset, pagination.limit, API_URL, getAuthHeaders]
  )

  // Auto-fetch transactions when token becomes available
  useEffect(() => {
    if (token) {
      console.log('[DEBUG] useTransactions - token available, fetching...')
      fetchTransactions({}, 0, 20)
    }
  }, [token])

  const createTransaction = useCallback(
    async (transactionData: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>) => {
      try {
        const response = await fetch(`${API_URL}/transactions`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(transactionData),
        })

        if (!response.ok) {
          throw new Error(`Failed to create transaction: ${response.statusText}`)
        }

        const newTransaction = await response.json()
        setTransactions((prev) => [newTransaction, ...prev])
        return newTransaction
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao criar transação'
        setError(message)
        throw err
      }
    },
    [API_URL, getAuthHeaders]
  )

  const updateTransaction = useCallback(
    async (id: string, updates: Partial<Transaction>) => {
      try {
        const response = await fetch(`${API_URL}/transactions/${id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(updates),
        })

        if (!response.ok) {
          throw new Error(`Failed to update transaction: ${response.statusText}`)
        }

        const updated = await response.json()
        setTransactions((prev) =>
          prev.map((t) => (t.id === id ? updated : t))
        )
        return updated
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao atualizar transação'
        setError(message)
        throw err
      }
    },
    [API_URL, getAuthHeaders]
  )

  const deleteTransaction = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`${API_URL}/transactions/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        })

        if (!response.ok) {
          throw new Error(`Failed to delete transaction: ${response.statusText}`)
        }

        setTransactions((prev) => prev.filter((t) => t.id !== id))
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao deletar transação'
        setError(message)
        throw err
      }
    },
    [API_URL, getAuthHeaders]
  )

  const reconcileTransaction = useCallback(
    async (id: string, isReconciled: boolean) => {
      return updateTransaction(id, { is_reconciled: isReconciled } as any)
    },
    [updateTransaction]
  )

  const changePage = useCallback(
    (newOffset: number) => {
      setPagination((prev) => ({ ...prev, offset: newOffset }))
    },
    []
  )

  return {
    transactions,
    loading,
    error,
    pagination,
    fetchTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    reconcileTransaction,
    changePage,
  }
}

'use client'

import { useCallback, useState } from 'react'

/**
 * useReports — fetch monthly summary and category breakdown in parallel.
 *
 * Mirrors the auth-header pattern of ``useTransactions``. The two endpoints
 * are fired with ``Promise.all`` (not sequential awaits) so month-switching
 * latency is bounded by the slower request, not the sum of both.
 */

export interface MonthlySummary {
  year: number
  month: number
  total_income: number
  total_expenses: number
  net_balance: number
}

export interface CategoryBreakdownItem {
  category_id: string | null
  category_name: string
  total: number
  percentage: number
}

export interface CategoryBreakdown {
  year: number
  month: number
  total_expenses: number
  items: CategoryBreakdownItem[]
}

export interface ReportsState {
  summary: MonthlySummary | null
  breakdown: CategoryBreakdown | null
  loading: boolean
  error: string | null
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function getAuthHeaders(token?: string): Record<string, string> {
  const stored =
    token || (typeof window !== 'undefined' ? localStorage.getItem('mony_tokens') : null)
  if (!stored) return {}

  try {
    const tokens = JSON.parse(stored)
    return {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    }
  } catch {
    return {
      Authorization: `Bearer ${stored}`,
      'Content-Type': 'application/json',
    }
  }
}

/**
 * Coerce numeric strings (e.g., Decimal-backed JSON) into JS numbers.
 * Pydantic v2 serializes ``Decimal`` as a string; Recharts needs numbers.
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const n = parseFloat(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function normalizeSummary(raw: any): MonthlySummary {
  return {
    year: Number(raw.year),
    month: Number(raw.month),
    total_income: toNumber(raw.total_income),
    total_expenses: toNumber(raw.total_expenses),
    net_balance: toNumber(raw.net_balance),
  }
}

function normalizeBreakdown(raw: any): CategoryBreakdown {
  return {
    year: Number(raw.year),
    month: Number(raw.month),
    total_expenses: toNumber(raw.total_expenses),
    items: (raw.items || []).map((item: any) => ({
      category_id: item.category_id ?? null,
      category_name: String(item.category_name ?? 'Sem categoria'),
      total: toNumber(item.total),
      percentage: toNumber(item.percentage),
    })),
  }
}

export function useReports(token?: string) {
  const [state, setState] = useState<ReportsState>({
    summary: null,
    breakdown: null,
    loading: false,
    error: null,
  })

  const fetchReports = useCallback(
    async (year: number, month: number) => {
      const headers = getAuthHeaders(token)
      if (Object.keys(headers).length === 0) {
        setState({ summary: null, breakdown: null, loading: false, error: null })
        return
      }

      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const qs = `year=${year}&month=${month}`
        // Parallel fetch (@po recommendation #3): bounded by slower request,
        // not the sum. Sequential awaits would double perceived latency.
        const [summaryResp, breakdownResp] = await Promise.all([
          fetch(`${API_URL}/reports/monthly-summary?${qs}`, { headers }),
          fetch(`${API_URL}/reports/category-breakdown?${qs}`, { headers }),
        ])

        if (!summaryResp.ok) {
          throw new Error(
            `Failed to fetch monthly summary: ${summaryResp.status} ${summaryResp.statusText}`
          )
        }
        if (!breakdownResp.ok) {
          throw new Error(
            `Failed to fetch category breakdown: ${breakdownResp.status} ${breakdownResp.statusText}`
          )
        }

        const [summaryJson, breakdownJson] = await Promise.all([
          summaryResp.json(),
          breakdownResp.json(),
        ])

        setState({
          summary: normalizeSummary(summaryJson),
          breakdown: normalizeBreakdown(breakdownJson),
          loading: false,
          error: null,
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao buscar relatórios'
        setState({
          summary: null,
          breakdown: null,
          loading: false,
          error: message,
        })
      }
    },
    [token]
  )

  return {
    ...state,
    fetchReports,
  }
}

// Small helper for page-level usage: "is this the current month?"
export function isCurrentMonth(year: number, month: number): boolean {
  const now = new Date()
  return now.getFullYear() === year && now.getMonth() + 1 === month
}

// Helper: safe month navigation (handles December <-> January rollover on client).
export function shiftMonth(year: number, month: number, delta: number): {
  year: number
  month: number
} {
  // JS Date is 0-indexed for months; we use 1-indexed here.
  const d = new Date(year, month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

// Re-export guard for tests/type-narrowing convenience.
export const __INTERNAL__ = { toNumber, normalizeSummary, normalizeBreakdown }

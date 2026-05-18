'use client'

import { useCallback, useState } from 'react'
import type { ReportParams } from '@/lib/api/reports'
import { fetchMonthlySummary, fetchCategoryBreakdown } from '@/lib/api/reports'

export type { ReportParams }

export interface MonthlySummary {
  year: number | null
  month: number | null
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
  year: number | null
  month: number | null
  total_expenses: number
  items: CategoryBreakdownItem[]
}

export interface ReportsState {
  summary: MonthlySummary | null
  breakdown: CategoryBreakdown | null
  loading: boolean
  error: string | null
}

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
    year: raw.year != null ? Number(raw.year) : null,
    month: raw.month != null ? Number(raw.month) : null,
    total_income: toNumber(raw.total_income),
    total_expenses: toNumber(raw.total_expenses),
    net_balance: toNumber(raw.net_balance),
  }
}

function normalizeBreakdown(raw: any): CategoryBreakdown {
  return {
    year: raw.year != null ? Number(raw.year) : null,
    month: raw.month != null ? Number(raw.month) : null,
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
    async (params: ReportParams) => {
      const headers = getAuthHeaders(token)
      if (Object.keys(headers).length === 0) {
        setState({ summary: null, breakdown: null, loading: false, error: null })
        return
      }

      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const accessToken = (() => {
          const stored = token || (typeof window !== 'undefined' ? localStorage.getItem('mony_tokens') : null)
          if (!stored) return ''
          try { return JSON.parse(stored).access_token ?? stored } catch { return stored }
        })()

        const [summaryJson, breakdownJson] = await Promise.all([
          fetchMonthlySummary(accessToken, params),
          fetchCategoryBreakdown(accessToken, params),
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

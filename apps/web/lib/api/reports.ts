'use client'

export type ReportParams =
  | { year: number; month: number }
  | { start_date: string; end_date: string }

export interface ReportPeriod {
  start: string
  end: string
}

export interface MonthlySummaryData {
  year: number | null
  month: number | null
  period: ReportPeriod
  total_income: string
  total_expenses: string
  net_balance: string
}

export interface CategoryBreakdownItemData {
  category_id: string | null
  category_name: string
  total: string
  percentage: number
}

export interface CategoryBreakdownData {
  year: number | null
  month: number | null
  period: ReportPeriod
  total_expenses: string
  items: CategoryBreakdownItemData[]
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function buildQS(params: ReportParams): string {
  if ('start_date' in params) {
    return `start_date=${params.start_date}&end_date=${params.end_date}`
  }
  return `year=${params.year}&month=${params.month}`
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export async function fetchMonthlySummary(
  token: string,
  params: ReportParams
): Promise<MonthlySummaryData> {
  const r = await fetch(`${API_URL}/reports/monthly-summary?${buildQS(params)}`, {
    headers: authHeaders(token),
  })
  if (!r.ok) throw new Error(`monthly-summary: ${r.status} ${r.statusText}`)
  return r.json()
}

export async function fetchCategoryBreakdown(
  token: string,
  params: ReportParams
): Promise<CategoryBreakdownData> {
  const r = await fetch(`${API_URL}/reports/category-breakdown?${buildQS(params)}`, {
    headers: authHeaders(token),
  })
  if (!r.ok) throw new Error(`category-breakdown: ${r.status} ${r.statusText}`)
  return r.json()
}

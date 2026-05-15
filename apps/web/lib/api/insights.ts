const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface TopCategory {
  category: string
  total: number
  percentage_of_expenses: number
}

export interface Trend {
  current_month_expenses: number
  previous_month_expenses: number
  pct_change: number
  trend_direction: 'up' | 'down' | 'stable'
}

export interface Anomaly {
  category: string
  current_month: number
  avg_3m: number
  ratio: number
}

export interface MonthlyInsights {
  period: { month: number; year: number }
  top_categories: TopCategory[]
  trend: Trend
  anomalies: Anomaly[]
}

export interface AutoCategorizeResult {
  category: string | null
  confidence: 'high' | 'low' | 'none'
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export async function fetchMonthlyInsights(token: string): Promise<MonthlyInsights> {
  const res = await fetch(`${API_URL}/insights/monthly`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error('Falha ao carregar insights')
  return res.json()
}

export async function fetchAutoCategory(
  token: string,
  description: string,
  merchant?: string
): Promise<AutoCategorizeResult> {
  const params = new URLSearchParams({ description })
  if (merchant) params.set('merchant', merchant)
  const res = await fetch(`${API_URL}/insights/auto-categorize?${params}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Falha ao categorizar')
  return res.json()
}

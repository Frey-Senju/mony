const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface BudgetPeriod {
  month: number
  year: number
}

export interface Budget {
  id: string
  category: string
  limit_amount: number
  currency: string
  spent_amount: number
  percentage: number
  alert_level: 'ok' | 'warning' | 'exceeded'
  period: BudgetPeriod
  created_at: string
  updated_at: string
}

export interface BudgetCreateInput {
  category: string
  limit_amount: number
  currency?: string
}

export interface BudgetUpdateInput {
  limit_amount: number
}

function authHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

export async function fetchBudgets(token: string): Promise<Budget[]> {
  const res = await fetch(`${API_URL}/budgets`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error('Falha ao carregar budgets')
  return res.json()
}

export async function createBudget(token: string, input: BudgetCreateInput): Promise<Budget> {
  const res = await fetch(`${API_URL}/budgets`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Falha ao criar budget')
  }
  return res.json()
}

export async function updateBudget(token: string, id: string, input: BudgetUpdateInput): Promise<Budget> {
  const res = await fetch(`${API_URL}/budgets/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Falha ao atualizar budget')
  }
  return res.json()
}

export async function deleteBudget(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/budgets/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Falha ao remover budget')
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface Goal {
  id: string
  name: string
  description: string | null
  target_amount: number
  current_amount: number
  currency: string
  progress_pct: number
  remaining_amount: number
  is_achieved: boolean
  target_date: string | null
  achieved_at: string | null
  created_at: string
  updated_at: string
}

export interface GoalCreateInput {
  name: string
  target_amount: number
  current_amount?: number
  currency?: string
  description?: string
  target_date?: string
}

export interface GoalUpdateInput {
  name?: string
  target_amount?: number
  description?: string
  target_date?: string
}

function headers(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function request<T>(url: string, options: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json()
}

export function fetchGoals(token: string): Promise<Goal[]> {
  return request(`${API_URL}/goals`, { headers: headers(token) })
}

export function createGoal(token: string, input: GoalCreateInput): Promise<Goal> {
  return request(`${API_URL}/goals`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(input),
  })
}

export function updateGoal(token: string, id: string, input: GoalUpdateInput): Promise<Goal> {
  return request(`${API_URL}/goals/${id}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(input),
  })
}

export function depositToGoal(token: string, id: string, amount: number): Promise<Goal> {
  return request(`${API_URL}/goals/${id}/deposit`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ amount }),
  })
}

export function deleteGoal(token: string, id: string): Promise<void> {
  return request(`${API_URL}/goals/${id}`, { method: 'DELETE', headers: headers(token) })
}

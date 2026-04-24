/**
 * Open Finance API client for Mony frontend.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface Institution {
  id: string
  external_id: string
  name: string
  logo_url: string | null
  authorization_server_url: string
}

export interface ConsentInitiateResponse {
  consent_id: string
  authorization_url: string
  expires_at: string
}

export interface LinkedAccount {
  id: string
  institution_id: string
  institution_name: string
  account_type: string | null
  account_number_last4: string | null
  owner_name: string | null
  currency: string
  is_active: boolean
  last_sync_at: string | null
  created_at: string
}

function authHeaders(token: string) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export async function listInstitutions(token: string, search?: string): Promise<Institution[]> {
  const url = new URL(`${API_URL}/open-finance/institutions`)
  if (search) url.searchParams.set('search', search)
  const res = await fetch(url.toString(), { headers: authHeaders(token) })
  if (!res.ok) throw new Error('Failed to fetch institutions')
  return res.json()
}

export async function initiateConsent(
  token: string,
  institutionId: string,
  permissions: string[] = ['openid', 'accounts', 'transactions']
): Promise<ConsentInitiateResponse> {
  const res = await fetch(`${API_URL}/open-finance/consent/initiate`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ institution_id: institutionId, permissions }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to initiate consent')
  }
  return res.json()
}

export async function listLinkedAccounts(token: string): Promise<LinkedAccount[]> {
  const res = await fetch(`${API_URL}/open-finance/accounts`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch linked accounts')
  return res.json()
}

export async function unlinkAccount(token: string, linkedAccountId: string): Promise<void> {
  const res = await fetch(`${API_URL}/open-finance/accounts/${linkedAccountId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to unlink account')
  }
}

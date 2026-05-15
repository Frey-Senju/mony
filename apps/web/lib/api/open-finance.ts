/**
 * Open Finance API client for the Mony frontend.
 *
 * Story 2.2 — adds sync trigger / status calls and migrates the error envelope
 * to the shared `ApiResponse<T>` type from `@mony/shared` so the frontend and
 * backend agree on the wire shape for error responses.
 */

import type { ApiResponse } from '@mony/shared'

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
  sync_status: 'idle' | 'syncing' | 'error'
  last_sync_error?: string | null
  created_at: string
}

export interface SyncTriggerResponse {
  sync_id: string
  accounts_queued: number
  status: 'queued' | 'running' | 'completed' | 'failed'
}

export interface SyncStatusResponse {
  sync_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  accounts_queued: number
  accounts_processed: number
  transactions_inserted: number
  transactions_skipped: number
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Best-effort parse of a FastAPI error body into the shared `ApiResponse`
 * envelope. FastAPI returns `{ detail: string }` for HTTPException; we expose
 * that as `error` so callers always read from the same property.
 */
async function parseError(res: Response): Promise<ApiResponse<never>> {
  try {
    const body = (await res.json()) as { detail?: string; error?: string; message?: string }
    return { error: body.detail || body.error || body.message || `HTTP ${res.status}` }
  } catch {
    return { error: `HTTP ${res.status}` }
  }
}

export async function listInstitutions(token: string, search?: string): Promise<Institution[]> {
  const url = new URL(`${API_URL}/open-finance/institutions`)
  if (search) url.searchParams.set('search', search)
  const res = await fetch(url.toString(), { headers: authHeaders(token) })
  if (!res.ok) {
    const err = await parseError(res)
    throw new Error(err.error)
  }
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
    const err = await parseError(res)
    throw new Error(err.error || 'Failed to initiate consent')
  }
  return res.json()
}

export async function listLinkedAccounts(token: string): Promise<LinkedAccount[]> {
  const res = await fetch(`${API_URL}/open-finance/accounts`, {
    headers: authHeaders(token),
  })
  if (!res.ok) {
    const err = await parseError(res)
    throw new Error(err.error || 'Failed to fetch linked accounts')
  }
  return res.json()
}

export async function unlinkAccount(token: string, linkedAccountId: string): Promise<void> {
  const res = await fetch(`${API_URL}/open-finance/accounts/${linkedAccountId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok && res.status !== 204) {
    const err = await parseError(res)
    throw new Error(err.error || 'Failed to unlink account')
  }
}

export async function triggerSync(
  token: string,
  accountId?: string
): Promise<SyncTriggerResponse> {
  const url = new URL(`${API_URL}/open-finance/sync`)
  if (accountId) url.searchParams.set('account_id', accountId)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) {
    const err = await parseError(res)
    throw new Error(err.error || 'Failed to trigger sync')
  }
  return res.json()
}

export async function getSyncStatus(
  token: string,
  syncId: string
): Promise<SyncStatusResponse> {
  const res = await fetch(`${API_URL}/open-finance/sync/${syncId}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) {
    const err = await parseError(res)
    throw new Error(err.error || 'Failed to fetch sync status')
  }
  return res.json()
}

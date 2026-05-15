// Shared types for Mony API and Web

/**
 * Transaction type — kept in sync with the Python `TransactionType` enum in
 * `apps/api/database/models.py`. Values use snake_case to match the wire
 * format produced by Pydantic v2 (which serialises Python enums by `.value`).
 */
export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'investment'
  | 'refund'

/**
 * Transaction source — added in Story 2.2 to distinguish user-entered records
 * from those imported via Open Finance.
 */
export type TransactionSource = 'manual' | 'open_finance'

export interface User {
  id: string
  email: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface Transaction {
  id: string
  userId: string
  type: TransactionType
  amount: number
  description: string
  date: string
  categoryId?: string
  source?: TransactionSource
  externalId?: string | null
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  name: string
  color: string
  icon: string
  userId?: string
}

export interface AuthResponse {
  accessToken: string
  user: User
}

/**
 * Generic API response envelope.
 *
 * The backend exposes some endpoints as bare JSON (e.g. `GET /transactions`
 * returns the items directly) and others wrapped — when consuming a wrapped
 * endpoint, type the fetch result as `ApiResponse<MyData>` rather than
 * redefining a local envelope.
 */
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

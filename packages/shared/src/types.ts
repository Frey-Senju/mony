// Shared types for Mony API and Web

export type TransactionType = 'income' | 'expense' | 'transfer'

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

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

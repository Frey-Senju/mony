/**
 * Dashboard Types
 *
 * Shared types for dashboard components and hooks
 */

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  type: 'income' | 'expense'
  amount: number
  currency: string
  description: string
  notes?: string
  transaction_date: string
  merchant_name?: string
  is_recurring: boolean
  recurring_pattern?: string
  is_reconciled: boolean
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface Account {
  id: string
  user_id: string
  name: string
  type: 'checking' | 'savings' | 'credit'
  balance: number
  currency: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FilterState {
  accountId?: string
  type?: 'all' | 'income' | 'expense'
  startDate?: string
  endDate?: string
  search?: string
  isReconciled?: 'all' | 'reconciled' | 'pending'
}

export interface PaginationState {
  offset: number
  limit: number
  total: number
}

export interface SummaryCardsProps {
  totalSpent: number
  totalIncome: number
  currentBalance: number
  budgetProgress?: number
  loading?: boolean
}

export interface TransactionListProps {
  transactions: Transaction[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onReconcile: (id: string, reconciled: boolean) => void
  loading?: boolean
  pagination?: PaginationState
  onPaginationChange?: (offset: number) => void
}

export interface FilterBarProps {
  onFilterChange: (filters: FilterState) => void
  accounts?: Account[]
  loading?: boolean
}

export interface ChartsProps {
  transactions: Transaction[]
  loading?: boolean
}

export interface TransactionModalProps {
  transaction?: Transaction
  isOpen: boolean
  onClose: () => void
  onSave: (data: Partial<Transaction>) => Promise<void>
  loading?: boolean
}

export interface BulkActionsProps {
  selectedCount: number
  onArchive: () => void
  onCategorize: () => void
  onDelete: () => void
  onExport: () => void
  onClearSelection: () => void
  loading?: boolean
}

export interface FilterPreset {
  name: string
  filters: FilterState
  createdAt: string
}

export interface CategoryData {
  id: string
  name: string
  color: string
  icon?: string
}

export interface ChartData {
  month?: string
  Receitas?: number
  Despesas?: number
  name?: string
  value?: number
}

export interface SummaryReport {
  totalTransactions: number
  totalIncome: number
  totalExpense: number
  balance: number
  reconciled: number
  pending: number
  monthlyBreakdown: Record<string, { income: number; expense: number }>
}

'use client'

import React, { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'

export interface FilterState {
  accountId?: string
  type?: 'all' | 'income' | 'expense'
  paymentMethod?: string
  startDate?: string
  endDate?: string
  search?: string
  isReconciled?: 'all' | 'reconciled' | 'pending'
}

export interface FilterBarProps {
  onFilterChange: (filters: FilterState) => void
  accounts?: Array<{ id: string; name: string }>
  loading?: boolean
  externalPaymentMethod?: string
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  pix: 'PIX',
  boleto: 'Boleto',
  bank_transfer: 'Transferência',
  cash: 'Dinheiro',
  other: 'Outro',
}

export function FilterBar({
  onFilterChange,
  accounts = [],
  externalPaymentMethod,
}: FilterBarProps) {
  const [filters, setFilters] = useState<FilterState>({
    type: 'all',
    isReconciled: 'all',
    paymentMethod: 'all',
  })

  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (externalPaymentMethod !== undefined) {
      setFilters((prev) => ({
        ...prev,
        paymentMethod: externalPaymentMethod || 'all',
      }))
    }
  }, [externalPaymentMethod])

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    onFilterChange(newFilters)
  }

  const resetFilters = () => {
    const resetState: FilterState = {
      type: 'all',
      isReconciled: 'all',
      paymentMethod: 'all',
    }
    setFilters(resetState)
    onFilterChange(resetState)
  }

  const hasActiveFilters =
    filters.search ||
    filters.accountId ||
    (filters.type && filters.type !== 'all') ||
    (filters.paymentMethod && filters.paymentMethod !== 'all') ||
    filters.startDate ||
    filters.endDate ||
    (filters.isReconciled && filters.isReconciled !== 'all')

  const getAccountName = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId)
    return account?.name || accountId
  }

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" aria-hidden="true" />
        <input
          type="text"
          placeholder="Buscar por descrição ou comerciante..."
          value={filters.search || ''}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          className="input-base pl-10 pr-4 py-2.5"
        />
      </div>

      {/* Filters Toggle / Collapse */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="text-sm font-medium hover:underline"
          style={{ color: 'var(--accent)' }}
        >
          {isOpen ? '▼ Ocultar filtros' : '▶ Mostrar filtros'}
        </button>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            Limpar filtros
          </button>
        )}
      </div>

      {/* Filter Options */}
      {isOpen && (
        <div className="glass-card grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {/* Account Filter */}
          {accounts.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Conta
              </label>
              <select
                value={filters.accountId || ''}
                onChange={(e) =>
                  handleFilterChange('accountId', e.target.value || undefined)
                }
                className="input-base"
              >
                <option value="">Todas as contas</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Type Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Tipo
            </label>
            <select
              value={filters.type || 'all'}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              className="input-base"
            >
              <option value="all">Todos</option>
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
            </select>
          </div>

          {/* Payment Method Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Forma de pagamento
            </label>
            <select
              aria-label="Forma de pagamento"
              value={filters.paymentMethod || 'all'}
              onChange={(e) => handleFilterChange('paymentMethod', e.target.value)}
              className="input-base"
            >
              <option value="all">Todas</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Reconciliation Status Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Status
            </label>
            <select
              value={filters.isReconciled || 'all'}
              onChange={(e) =>
                handleFilterChange(
                  'isReconciled',
                  e.target.value as 'all' | 'reconciled' | 'pending'
                )
              }
              className="input-base"
            >
              <option value="all">Todos</option>
              <option value="reconciled">Reconciliado</option>
              <option value="pending">Pendente</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Data inicial
            </label>
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={(e) =>
                handleFilterChange('startDate', e.target.value || undefined)
              }
              className="input-base"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Data final
            </label>
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={(e) =>
                handleFilterChange('endDate', e.target.value || undefined)
              }
              className="input-base"
            />
          </div>
        </div>
      )}

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.search && (
            <span className="px-3 py-1 rounded-full bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium flex items-center gap-1.5">
              Busca: {filters.search}
              <button
                type="button"
                onClick={() => handleFilterChange('search', undefined)}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.accountId && (
            <span className="px-3 py-1 rounded-full bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium flex items-center gap-1.5">
              Conta: {getAccountName(filters.accountId)}
              <button
                type="button"
                onClick={() => handleFilterChange('accountId', undefined)}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.type && filters.type !== 'all' && (
            <span className="px-3 py-1 rounded-full bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium flex items-center gap-1.5">
              Tipo: {filters.type === 'income' ? 'Receita' : 'Despesa'}
              <button
                type="button"
                onClick={() => handleFilterChange('type', 'all')}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.paymentMethod && filters.paymentMethod !== 'all' && (
            <span className="px-3 py-1 rounded-full bg-purple-100/80 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium flex items-center gap-1.5">
              Pagamento: {PAYMENT_METHOD_LABELS[filters.paymentMethod] || filters.paymentMethod}
              <button
                type="button"
                onClick={() => handleFilterChange('paymentMethod', 'all')}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.startDate && (
            <span className="px-3 py-1 rounded-full bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium flex items-center gap-1.5">
              De: {new Date(filters.startDate).toLocaleDateString('pt-BR')}
              <button
                type="button"
                onClick={() => handleFilterChange('startDate', undefined)}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.endDate && (
            <span className="px-3 py-1 rounded-full bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium flex items-center gap-1.5">
              Até: {new Date(filters.endDate).toLocaleDateString('pt-BR')}
              <button
                type="button"
                onClick={() => handleFilterChange('endDate', undefined)}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

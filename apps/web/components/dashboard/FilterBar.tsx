'use client'

import React, { useState } from 'react'
import { Search, X } from 'lucide-react'

interface FilterState {
  accountId?: string
  type?: 'all' | 'income' | 'expense'
  startDate?: string
  endDate?: string
  search?: string
  isReconciled?: 'all' | 'reconciled' | 'pending'
}

interface FilterBarProps {
  onFilterChange: (filters: FilterState) => void
  accounts?: Array<{ id: string; name: string }>
  loading?: boolean
}

export function FilterBar({
  onFilterChange,
  accounts = [],
  loading = false,
}: FilterBarProps) {
  const [filters, setFilters] = useState<FilterState>({
    type: 'all',
    isReconciled: 'all',
  })

  const [isOpen, setIsOpen] = useState(false)

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    onFilterChange(newFilters)
  }

  const resetFilters = () => {
    const resetState = {
      type: 'all',
      isReconciled: 'all',
    }
    setFilters(resetState)
    onFilterChange(resetState)
  }

  const hasActiveFilters =
    filters.search ||
    filters.accountId ||
    (filters.type && filters.type !== 'all') ||
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
        <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por descrição ou comerciante..."
          value={filters.search || ''}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Filters Toggle / Collapse */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          {isOpen ? '▼ Ocultar filtros' : '▶ Mostrar filtros'}
        </button>
        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            Limpar filtros
          </button>
        )}
      </div>

      {/* Filter Options */}
      {isOpen && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
          {/* Account Filter */}
          {accounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Conta
              </label>
              <select
                value={filters.accountId || ''}
                onChange={(e) =>
                  handleFilterChange('accountId', e.target.value || undefined)
                }
                className="w-full px-3 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tipo
            </label>
            <select
              value={filters.type || 'all'}
              onChange={(e) => handleFilterChange('type', e.target.value)}
              className="w-full px-3 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos</option>
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
            </select>
          </div>

          {/* Reconciliation Status Filter */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
              className="w-full px-3 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos</option>
              <option value="reconciled">Reconciliado</option>
              <option value="pending">Pendente</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Data inicial
            </label>
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={(e) =>
                handleFilterChange('startDate', e.target.value || undefined)
              }
              className="w-full px-3 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Data final
            </label>
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={(e) =>
                handleFilterChange('endDate', e.target.value || undefined)
              }
              className="w-full px-3 py-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {filters.search && (
            <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm flex items-center gap-2">
              Busca: {filters.search}
              <button
                onClick={() => handleFilterChange('search', undefined)}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.accountId && (
            <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm flex items-center gap-2">
              Conta: {getAccountName(filters.accountId)}
              <button
                onClick={() => handleFilterChange('accountId', undefined)}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.type && filters.type !== 'all' && (
            <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm flex items-center gap-2">
              Tipo: {filters.type === 'income' ? 'Receita' : 'Despesa'}
              <button
                onClick={() => handleFilterChange('type', 'all')}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.startDate && (
            <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm flex items-center gap-2">
              De: {new Date(filters.startDate).toLocaleDateString('pt-BR')}
              <button
                onClick={() => handleFilterChange('startDate', undefined)}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.endDate && (
            <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm flex items-center gap-2">
              Até: {new Date(filters.endDate).toLocaleDateString('pt-BR')}
              <button
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

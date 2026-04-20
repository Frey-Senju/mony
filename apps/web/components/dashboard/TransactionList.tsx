'use client'

import React from 'react'
import { Trash2, Edit2, Check, X, TrendingUp, TrendingDown } from 'lucide-react'

interface Transaction {
  id: string
  description: string
  amount: number
  type: 'income' | 'expense'
  transaction_date: string
  merchant_name?: string
  is_reconciled: boolean
  currency: string
  category_id?: string
}

interface TransactionListProps {
  transactions: Transaction[]
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onReconcile: (id: string, reconciled: boolean) => void
  loading?: boolean
  pagination?: {
    offset: number
    limit: number
    total: number
  }
  onPaginationChange?: (offset: number) => void
}

const CATEGORY_MAP: { [key: string]: string } = {
  '1': 'Alimentação',
  '2': 'Transporte',
  '3': 'Saúde',
  '4': 'Lazer',
  '5': 'Educação',
  '6': 'Trabalho',
  '7': 'Casa',
  '8': 'Outros',
}

const CATEGORY_COLORS: { [key: string]: string } = {
  '1': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  '2': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  '3': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  '4': 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
  '5': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  '6': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  '7': 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  '8': 'bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300',
}

export function TransactionList({
  transactions,
  selectedIds,
  onSelectionChange,
  onEdit,
  onDelete,
  onReconcile,
  loading = false,
  pagination,
  onPaginationChange,
}: TransactionListProps) {
  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(transactions.map((t) => t.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    onSelectionChange(newSelected)
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency || 'BRL',
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-16 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">
          Nenhuma transação encontrada
        </p>
      </div>
    )
  }

  const allSelected = selectedIds.size === transactions.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < transactions.length

  return (
    <div className="space-y-3">
      {/* Bulk Actions Bar */}
      {someSelected && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {selectedIds.size} selecionado(s)
          </span>
          <button
            onClick={() => onSelectionChange(new Set())}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Desselecionar tudo
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = someSelected
                    }
                  }}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-900 dark:text-slate-100">
                Descrição
              </th>
              <th className="px-4 py-3 text-right font-medium text-slate-900 dark:text-slate-100">
                Valor
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-900 dark:text-slate-100">
                Categoria
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-900 dark:text-slate-100">
                Data
              </th>
              <th className="px-4 py-3 text-center font-medium text-slate-900 dark:text-slate-100">
                Status
              </th>
              <th className="px-4 py-3 text-right font-medium text-slate-900 dark:text-slate-100">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr
                key={transaction.id}
                className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(transaction.id)}
                    onChange={() => toggleSelect(transaction.id)}
                    className="rounded"
                  />
                </td>
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {transaction.description}
                    </p>
                    {transaction.merchant_name && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {transaction.merchant_name}
                      </p>
                    )}
                  </div>
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${
                    transaction.type === 'income'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  <div className="flex items-center justify-end gap-2">
                    {transaction.type === 'income' ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    {formatCurrency(
                      Math.abs(transaction.amount),
                      transaction.currency
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {transaction.category_id && CATEGORY_MAP[transaction.category_id] ? (
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                        CATEGORY_COLORS[transaction.category_id]
                      }`}
                    >
                      {CATEGORY_MAP[transaction.category_id]}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Sem categoria</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                  {formatDate(transaction.transaction_date)}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() =>
                      onReconcile(transaction.id, !transaction.is_reconciled)
                    }
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
                    title={
                      transaction.is_reconciled
                        ? 'Marcar como não reconciliado'
                        : 'Marcar como reconciliado'
                    }
                  >
                    {transaction.is_reconciled ? (
                      <>
                        <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span className="text-green-600 dark:text-green-400">
                          OK
                        </span>
                      </>
                    ) : (
                      <>
                        <X className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-400">Pendente</span>
                      </>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                  <button
                    onClick={() => onEdit(transaction.id)}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-blue-600 dark:text-blue-400"
                    title="Editar"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(transaction.id)}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-red-600 dark:text-red-400"
                    title="Deletar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Mostrando {pagination.offset + 1} a{' '}
            {Math.min(pagination.offset + pagination.limit, pagination.total)} de{' '}
            {pagination.total} transações
          </p>
          <div className="flex gap-2">
            <button
              onClick={() =>
                onPaginationChange &&
                onPaginationChange(Math.max(0, pagination.offset - pagination.limit))
              }
              disabled={pagination.offset === 0}
              className="px-4 py-2 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() =>
                onPaginationChange &&
                onPaginationChange(
                  Math.min(
                    pagination.offset + pagination.limit,
                    pagination.total - pagination.limit
                  )
                )
              }
              disabled={pagination.offset + pagination.limit >= pagination.total}
              className="px-4 py-2 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

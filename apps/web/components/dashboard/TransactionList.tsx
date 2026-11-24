'use client'

import React from 'react'
import { Trash2, Edit2, Check, X, TrendingUp, TrendingDown, Landmark } from 'lucide-react'

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
  category_name?: string
  category_color?: string
  category_icon?: string
  source?: 'manual' | 'open_finance'
  external_id?: string | null
  payment_method?: string | null
  installment_number?: number | null
  installment_total?: number | null
  statement_month?: string | null
  original_purchase_date?: string | null
}

export interface TransactionListProps {
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

const LEGACY_CATEGORY_MAP: { [key: string]: string } = {
  '1': 'Alimentação',
  '2': 'Transporte',
  '3': 'Saúde',
  '4': 'Lazer',
  '5': 'Educação',
  '6': 'Trabalho',
  '7': 'Casa',
  '8': 'Outros',
}

const LEGACY_CATEGORY_COLORS: { [key: string]: string } = {
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
      <div className="space-y-3" aria-busy="true" aria-label="Carregando transações">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 glass-card animate-pulse" />
        ))}
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="glass-panel text-center py-12">
        <p className="text-slate-600 dark:text-slate-300 font-medium">
          Nenhuma transação encontrada
        </p>
      </div>
    )
  }

  const allSelected = selectedIds.size === transactions.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < transactions.length

  return (
    <div className="space-y-3">
      {/* Bulk Selection Bar */}
      {someSelected && (
        <div
          role="status"
          aria-live="polite"
          className="glass-card px-4 py-3 flex items-center justify-between border-primary-300/60"
        >
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {selectedIds.size} selecionado(s)
          </span>
          <button
            type="button"
            onClick={() => onSelectionChange(new Set())}
            className="text-sm font-medium text-primary-600 hover:underline"
          >
            Desselecionar tudo
          </button>
        </div>
      )}

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/40 dark:bg-white/5 border-b border-slate-200/70 dark:border-white/10">
                <th scope="col" className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todas as transações"
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
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-slate-100">
                  Descrição
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                  Valor
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-slate-100">
                  Categoria
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-slate-100">
                  Data
                </th>
                <th scope="col" className="px-4 py-3 text-center font-semibold text-slate-900 dark:text-slate-100">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => {
                const resolvedCategoryName =
                  transaction.category_name ||
                  (transaction.category_id ? LEGACY_CATEGORY_MAP[transaction.category_id] : undefined)

                return (
                  <tr
                    key={transaction.id}
                    className="border-b border-slate-200/60 dark:border-white/10 last:border-b-0 hover:bg-white/45 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar transação ${transaction.description}`}
                        checked={selectedIds.has(transaction.id)}
                        onChange={() => toggleSelect(transaction.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="flex items-center flex-wrap gap-1.5">
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {transaction.description}
                          </p>
                          {transaction.installment_number && transaction.installment_total && (
                            <span
                              className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100/80 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                              title={
                                transaction.original_purchase_date
                                  ? `Parcela ${transaction.installment_number} de ${transaction.installment_total} · Compra em ${transaction.original_purchase_date}`
                                  : `Parcela ${transaction.installment_number} de ${transaction.installment_total}`
                              }
                            >
                              Parcela {transaction.installment_number}/{transaction.installment_total}
                            </span>
                          )}
                          {transaction.payment_method && (
                            <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100/80 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                              {transaction.payment_method === 'credit_card'
                                ? 'Cartão'
                                : transaction.payment_method === 'debit_card'
                                ? 'Débito'
                                : transaction.payment_method === 'pix'
                                ? 'PIX'
                                : transaction.payment_method === 'boleto'
                                ? 'Boleto'
                                : transaction.payment_method === 'bank_transfer'
                                ? 'Transf.'
                                : transaction.payment_method === 'cash'
                                ? 'Dinheiro'
                                : transaction.payment_method}
                            </span>
                          )}
                          {transaction.source === 'open_finance' && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                              data-testid="open-finance-badge"
                              title="Importada via Open Finance"
                            >
                              <Landmark className="w-3 h-3" aria-hidden="true" />
                              Open Finance
                            </span>
                          )}
                        </div>
                        {transaction.merchant_name && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {transaction.merchant_name}
                          </p>
                        )}
                      </div>
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                        transaction.type === 'income'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        {transaction.type === 'income' ? (
                          <TrendingUp className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <TrendingDown className="w-4 h-4" aria-hidden="true" />
                        )}
                        {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {resolvedCategoryName ? (
                        transaction.category_color ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${transaction.category_color}22`,
                              color: transaction.category_color,
                              border: `1px solid ${transaction.category_color}44`,
                            }}
                          >
                            {transaction.category_icon && <span aria-hidden="true">{transaction.category_icon}</span>}
                            {resolvedCategoryName}
                          </span>
                        ) : (
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                              (transaction.category_id && LEGACY_CATEGORY_COLORS[transaction.category_id]) ||
                              'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {resolvedCategoryName}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-slate-400">Sem categoria</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDate(transaction.transaction_date)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onReconcile(transaction.id, !transaction.is_reconciled)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium hover:bg-white/50 dark:hover:bg-white/10 transition-colors"
                        title={
                          transaction.is_reconciled
                            ? 'Marcar como não reconciliado'
                            : 'Marcar como reconciliado'
                        }
                        aria-label={
                          transaction.is_reconciled
                            ? `Marcar ${transaction.description} como pendente`
                            : `Marcar ${transaction.description} como reconciliado`
                        }
                      >
                        {transaction.is_reconciled ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                            <span className="text-emerald-600 dark:text-emerald-400">OK</span>
                          </>
                        ) : (
                          <>
                            <X className="w-4 h-4 text-slate-400" aria-hidden="true" />
                            <span className="text-slate-500 dark:text-slate-400">Pendente</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEdit(transaction.id)}
                          className="p-1.5 hover:bg-white/60 dark:hover:bg-white/10 rounded-lg transition-colors text-blue-600 dark:text-blue-400"
                          title="Editar"
                          aria-label={`Editar ${transaction.description}`}
                        >
                          <Edit2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(transaction.id)}
                          className="p-1.5 hover:bg-red-50/70 dark:hover:bg-red-950/30 rounded-lg transition-colors text-red-600 dark:text-red-400"
                          title="Deletar"
                          aria-label={`Deletar ${transaction.description}`}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Mostrando {pagination.offset + 1} a{' '}
            {Math.min(pagination.offset + pagination.limit, pagination.total)} de{' '}
            {pagination.total} transações
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                onPaginationChange &&
                onPaginationChange(Math.max(0, pagination.offset - pagination.limit))
              }
              disabled={pagination.offset === 0}
              className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() =>
                onPaginationChange &&
                onPaginationChange(
                  Math.min(
                    pagination.offset + pagination.limit,
                    Math.max(0, pagination.total - pagination.limit)
                  )
                )
              }
              disabled={pagination.offset + pagination.limit >= pagination.total}
              className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

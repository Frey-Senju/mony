'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Wallet, X } from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { SummaryCards } from '@/components/dashboard/SummaryCards'
import { TransactionList } from '@/components/dashboard/TransactionList'
import { FilterBar } from '@/components/dashboard/FilterBar'
import { Charts } from '@/components/dashboard/Charts'
import { TransactionModal } from '@/components/dashboard/TransactionModal'
import { BulkActions } from '@/components/dashboard/BulkActions'
import { useTransactions, type FilterState, type Transaction } from '@/hooks/useTransactions'
import { useFilter } from '@/hooks/useFilter'
import { useCategories } from '@/hooks/useCategories'
import { useBudgets } from '@/hooks/useBudgets'
import { exportToCSV, exportToJSON, exportToHTML } from '@/utils/export'
import { useAuth } from '@/stores/auth/useAuth'

interface Account {
  id: string
  name: string
  balance?: number
}

export default function DashboardPage() {
  return (
    <PrivateRoute>
      <DashboardContent />
    </PrivateRoute>
  )
}

function DashboardContent() {
  const auth = useAuth()
  const { user } = auth
  const accessToken = auth.tokens?.access_token
  const {
    transactions,
    loading,
    pagination,
    fetchTransactions,
    deleteTransaction,
    reconcileTransaction,
    changePage,
    updateTransaction,
    createTransaction,
    bulkCategorize,
  } = useTransactions(accessToken)
  const { filters, updateMultipleFilters } = useFilter()
  const { categories } = useCategories(accessToken)
  const { budgets } = useBudgets(accessToken)

  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | undefined>()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkLoading, setIsBulkLoading] = useState(false)
  const [bulkCatModalOpen, setBulkCatModalOpen] = useState(false)
  const [bulkCategoryId, setBulkCategoryId] = useState('')

  const fetchAccounts = useCallback(async () => {
    if (!accessToken) return
    setAccountsLoading(true)
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/accounts`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )
      if (response.ok) {
        const data = await response.json()
        setAccounts(Array.isArray(data) ? data : data.items || [])
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error)
    } finally {
      setAccountsLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const buildApiFilters = useCallback((): FilterState => {
    return {
      accountId: filters.accountId,
      type: filters.type !== 'all' ? (filters.type as 'income' | 'expense') : undefined,
      startDate: filters.startDate,
      endDate: filters.endDate,
      search: filters.search,
      isReconciled:
        filters.isReconciled !== 'all'
          ? (filters.isReconciled as 'reconciled' | 'pending')
          : undefined,
    }
  }, [filters])

  useEffect(() => {
    fetchTransactions(buildApiFilters(), 0, 20)
  }, [filters, fetchTransactions, buildApiFilters])

  // Summary metrics
  const currentDate = new Date()
  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()

  const monthlyTransactions = transactions.filter((t) => {
    const txDate = new Date(t.transaction_date)
    return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear
  })

  const totalSpent = monthlyTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const totalIncome = monthlyTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const previousDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
  const previousMonth = previousDate.getMonth()
  const previousYear = previousDate.getFullYear()

  const previousMonthTransactions = transactions.filter((t) => {
    const txDate = new Date(t.transaction_date)
    return txDate.getMonth() === previousMonth && txDate.getFullYear() === previousYear
  })

  const previousMonthSpent = previousMonthTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const previousMonthIncome = previousMonthTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const currentBalance = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0)

  // Real budget progress computed from /budgets API
  const budgetsExceeded = budgets.filter((b) => b.alert_level === 'exceeded').length
  const budgetProgress =
    budgets.length > 0
      ? Math.round(
          budgets.reduce((sum, b) => sum + Math.min(100, Number(b.percentage || 0)), 0) /
            budgets.length
        )
      : 0

  const handleEdit = (id: string) => {
    const tx = transactions.find((t) => t.id === id)
    if (tx) {
      setSelectedTransaction(tx)
      setIsModalOpen(true)
    }
  }

  const handleModalSave = async (data: Partial<Transaction>) => {
    try {
      if (selectedTransaction) {
        await updateTransaction(selectedTransaction.id, data)
      } else {
        await createTransaction(data as Omit<Transaction, 'id' | 'created_at' | 'updated_at'>)
      }
      setIsModalOpen(false)
      setSelectedTransaction(undefined)
      await Promise.all([fetchTransactions(buildApiFilters(), 0, 20), fetchAccounts()])
    } catch (error) {
      console.error('Failed to save transaction:', error)
      throw error
    }
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Tem certeza que deseja deletar ${selectedIds.size} transação(ões)?`)) {
      return
    }
    setIsBulkLoading(true)
    try {
      for (const id of Array.from(selectedIds)) {
        await deleteTransaction(id)
      }
      setSelectedIds(new Set())
      await fetchAccounts()
    } catch (error) {
      console.error('Failed to delete transactions:', error)
    } finally {
      setIsBulkLoading(false)
    }
  }

  const handleBulkCategorize = () => {
    if (selectedIds.size === 0) return
    setBulkCategoryId(categories[0]?.id || '')
    setBulkCatModalOpen(true)
  }

  const confirmBulkCategorize = async () => {
    if (!bulkCategoryId || selectedIds.size === 0) return
    setIsBulkLoading(true)
    try {
      await bulkCategorize(Array.from(selectedIds), bulkCategoryId)
      setBulkCatModalOpen(false)
      setSelectedIds(new Set())
      await fetchTransactions(buildApiFilters(), pagination.offset, pagination.limit)
    } catch (error) {
      console.error('Failed to bulk categorize:', error)
    } finally {
      setIsBulkLoading(false)
    }
  }

  const handleBulkExport = (format: 'csv' | 'json' | 'html') => {
    if (selectedIds.size === 0) return
    const selectedTransactions = transactions.filter((t) => selectedIds.has(t.id))
    const dateStr = new Date().toISOString().split('T')[0]

    switch (format) {
      case 'csv':
        exportToCSV(selectedTransactions, `transacoes-${dateStr}.csv`)
        break
      case 'json':
        exportToJSON(selectedTransactions, `transacoes-${dateStr}.json`)
        break
      case 'html':
        exportToHTML(selectedTransactions, `relatorio-${dateStr}.html`)
        break
    }
  }

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return
    setIsBulkLoading(true)
    try {
      for (const id of Array.from(selectedIds)) {
        await reconcileTransaction(id, true)
      }
      setSelectedIds(new Set())
    } finally {
      setIsBulkLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja deletar esta transação?')) {
      try {
        await deleteTransaction(id)
        await fetchAccounts()
      } catch (error) {
        console.error('Failed to delete transaction:', error)
      }
    }
  }

  const handleReconcile = async (id: string, reconciled: boolean) => {
    try {
      await reconcileTransaction(id, reconciled)
    } catch (error) {
      console.error('Failed to reconcile transaction:', error)
    }
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Glass Hero Header */}
        <header className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Dashboard Financeiro
            </h1>
            <p className="text-slate-600 dark:text-slate-300 mt-1">
              Bem-vindo, {user?.full_name || 'Usuário'}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/dashboard/accounts"
              className="liquid-btn liquid-btn-glass inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
            >
              <Wallet className="w-4 h-4" aria-hidden="true" />
              Gerenciar Contas
            </Link>
            <button
              type="button"
              onClick={() => {
                setSelectedTransaction(undefined)
                setIsModalOpen(true)
              }}
              className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              + Nova Transação
            </button>
          </div>
        </header>

        {/* Empty Accounts Onboarding Banner */}
        {!accountsLoading && accounts.length === 0 && (
          <div
            role="status"
            className="glass-card p-5 border-amber-400/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">
                Crie sua primeira conta bancária ou carteira
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Para registrar transações, você precisa ter pelo menos uma conta cadastrada.
              </p>
            </div>
            <Link
              href="/dashboard/accounts"
              className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-sm font-semibold shrink-0 text-center"
            >
              Criar Conta Agora
            </Link>
          </div>
        )}

        {/* Summary Cards */}
        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Resumo do mês
          </h2>
          <SummaryCards
            totalSpent={totalSpent}
            totalIncome={totalIncome}
            currentBalance={currentBalance}
            budgetProgress={budgetProgress}
            budgetsExceeded={budgetsExceeded}
            loading={loading}
            previousMonthData={
              previousMonthTransactions.length > 0
                ? {
                    totalSpent: previousMonthSpent,
                    totalIncome: previousMonthIncome,
                    currentBalance,
                  }
                : undefined
            }
          />
        </section>

        {/* Charts */}
        <section aria-labelledby="charts-heading">
          <h2 id="charts-heading" className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Análise Financeira
          </h2>
          <Charts transactions={transactions} loading={loading} />
        </section>

        {/* Filters */}
        <section aria-labelledby="filters-heading">
          <h2 id="filters-heading" className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Filtros
          </h2>
          <FilterBar
            onFilterChange={updateMultipleFilters}
            accounts={accounts}
            loading={accountsLoading}
          />
        </section>

        {/* Transaction List */}
        <section aria-labelledby="transactions-heading">
          <h2 id="transactions-heading" className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Transações
          </h2>
          <TransactionList
            transactions={transactions}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onReconcile={handleReconcile}
            loading={loading}
            pagination={pagination}
            onPaginationChange={changePage}
          />
        </section>
      </div>

      {/* Bulk Actions Toolbar */}
      <BulkActions
        selectedCount={selectedIds.size}
        onDelete={handleBulkDelete}
        onCategorize={handleBulkCategorize}
        onExport={handleBulkExport}
        onArchive={handleBulkArchive}
        onClearSelection={() => setSelectedIds(new Set())}
        loading={isBulkLoading}
      />

      {/* Transaction Modal */}
      <TransactionModal
        transaction={selectedTransaction}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedTransaction(undefined)
        }}
        onSave={handleModalSave}
        accounts={accounts}
        loading={loading}
        categories={categories}
      />

      {/* Bulk Categorize Modal */}
      {bulkCatModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-cat-title"
        >
          <div className="glass-modal max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="bulk-cat-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Categorizar {selectedIds.size} transação(ões)
              </h2>
              <button
                type="button"
                onClick={() => setBulkCatModalOpen(false)}
                aria-label="Fechar modal"
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div>
              <label htmlFor="bulk-cat-select" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                Escolha a categoria
              </label>
              <select
                id="bulk-cat-select"
                value={bulkCategoryId}
                onChange={(e) => setBulkCategoryId(e.target.value)}
                className="input-base"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon ? `${cat.icon} ` : ''}
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBulkCatModalOpen(false)}
                className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isBulkLoading || !bulkCategoryId}
                onClick={confirmBulkCategorize}
                className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {isBulkLoading ? 'Aplicando...' : 'Aplicar categoria'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

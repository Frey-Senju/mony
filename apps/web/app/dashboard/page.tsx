'use client'

import React, { useEffect, useState } from 'react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { SummaryCards } from '@/components/dashboard/SummaryCards'
import { TransactionList } from '@/components/dashboard/TransactionList'
import { FilterBar } from '@/components/dashboard/FilterBar'
import { Charts } from '@/components/dashboard/Charts'
import { TransactionModal } from '@/components/dashboard/TransactionModal'
import { BulkActions } from '@/components/dashboard/BulkActions'
import { useTransactions, type FilterState, type Transaction } from '@/hooks/useTransactions'
import { useFilter } from '@/hooks/useFilter'
import { useCategories, type Category } from '@/hooks/useCategories'
import { exportToCSV, exportToJSON, exportToHTML } from '@/utils/export'
import { useAuth } from '@/stores/auth/useAuth'

interface Account {
  id: string
  name: string
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
  const { transactions, loading, pagination, fetchTransactions, deleteTransaction, reconcileTransaction, changePage, updateTransaction, createTransaction } = useTransactions(auth.tokens?.access_token)
  const { filters, updateMultipleFilters, resetFilters, hasActiveFilters } = useFilter()
  const { categories } = useCategories()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | undefined>()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkLoading, setIsBulkLoading] = useState(false)

  // Fetch accounts
  useEffect(() => {
    const fetchAccounts = async () => {
      setAccountsLoading(true)
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/accounts`,
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('mony_tokens')?.split('"access_token":"')[1]?.split('"')[0]}`,
            },
          }
        )
        if (response.ok) {
          const data = await response.json()
          setAccounts(data.items || data)
        }
      } catch (error) {
        console.error('Failed to fetch accounts:', error)
      } finally {
        setAccountsLoading(false)
      }
    }

    fetchAccounts()
  }, [])

  // Fetch transactions when filters change or token becomes available
  useEffect(() => {
    const apiFilters: FilterState = {
      accountId: filters.accountId,
      type: filters.type !== 'all' ? (filters.type as 'income' | 'expense') : undefined,
      startDate: filters.startDate,
      endDate: filters.endDate,
      search: filters.search,
      isReconciled: filters.isReconciled !== 'all' ? (filters.isReconciled as 'reconciled' | 'pending') : undefined,
    }

    fetchTransactions(apiFilters, 0, 20)
  }, [filters, fetchTransactions])

  // Calculate summary metrics for current month
  const currentDate = new Date()
  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()

  const monthlyTransactions = transactions.filter((t) => {
    const txDate = new Date(t.transaction_date)
    return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear
  })

  const totalSpent = monthlyTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)

  const totalIncome = monthlyTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)

  // Calculate metrics for previous month (for trends)
  const previousDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
  const previousMonth = previousDate.getMonth()
  const previousYear = previousDate.getFullYear()

  const previousMonthTransactions = transactions.filter((t) => {
    const txDate = new Date(t.transaction_date)
    return txDate.getMonth() === previousMonth && txDate.getFullYear() === previousYear
  })

  const previousMonthSpent = previousMonthTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)

  const previousMonthIncome = previousMonthTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)

  const currentBalance = accounts.reduce(
    (sum, account: any) => sum + (account.balance || 0),
    0
  )

  const budgetProgress = 45 // Placeholder, should come from budget API

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
        // Update existing transaction
        await updateTransaction(selectedTransaction.id, data)
      } else {
        // Create new transaction
        await createTransaction(data as Omit<Transaction, 'id' | 'created_at' | 'updated_at'>)
      }
      setIsModalOpen(false)
      setSelectedTransaction(undefined)
      // Refresh transactions list
      const apiFilters: FilterState = {
        accountId: filters.accountId,
        type: filters.type !== 'all' ? (filters.type as 'income' | 'expense') : undefined,
        startDate: filters.startDate,
        endDate: filters.endDate,
        search: filters.search,
        isReconciled: filters.isReconciled !== 'all' ? (filters.isReconciled as 'reconciled' | 'pending') : undefined,
      }
      fetchTransactions(apiFilters, 0, 20)
    } catch (error) {
      console.error('Failed to save transaction:', error)
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
    } catch (error) {
      console.error('Failed to delete transactions:', error)
    } finally {
      setIsBulkLoading(false)
    }
  }

  const handleBulkCategorize = () => {
    if (selectedIds.size === 0) return

    // Show category selector modal or side panel
    const selectedTransactions = transactions.filter((t) => selectedIds.has(t.id))
    console.log('Categorize:', selectedTransactions)
    // TODO: Implement category assignment modal
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
    console.log('Archive:', Array.from(selectedIds))
    // TODO: Implement archive functionality (if needed)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja deletar esta transação?')) {
      try {
        await deleteTransaction(id)
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

  const handlePaginationChange = (offset: number) => {
    changePage(offset)
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                Dashboard Financeiro
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Bem-vindo, {user?.full_name || 'Usuário'}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedTransaction(undefined)
                setIsModalOpen(true)
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + Nova Transação
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Summary Cards */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Resumo do mês
          </h2>
          <SummaryCards
            totalSpent={totalSpent}
            totalIncome={totalIncome}
            currentBalance={currentBalance}
            budgetProgress={budgetProgress}
            loading={loading}
            previousMonthData={
              previousMonthTransactions.length > 0
                ? {
                    totalSpent: previousMonthSpent,
                    totalIncome: previousMonthIncome,
                    currentBalance: currentBalance, // Use current balance as baseline
                  }
                : undefined
            }
          />
        </section>

        {/* Charts */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Análise Financeira
          </h2>
          <Charts transactions={transactions} loading={loading} />
        </section>

        {/* Filters */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Transações
          </h2>
          <FilterBar
            onFilterChange={updateMultipleFilters}
            accounts={accounts}
            loading={accountsLoading}
          />
        </section>

        {/* Transaction List */}
        <section>
          <TransactionList
            transactions={transactions}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onReconcile={handleReconcile}
            loading={loading}
            pagination={pagination}
            onPaginationChange={handlePaginationChange}
          />
        </section>

        {/* Info Text */}
        {hasActiveFilters && transactions.length === 0 && !loading && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center text-blue-700 dark:text-blue-300">
            Nenhuma transação encontrada com esses filtros.{' '}
            <button
              onClick={resetFilters}
              className="underline hover:no-underline font-medium"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

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
        categories={categories as Category[]}
      />

      {/* Bulk Actions Bar */}
      <BulkActions
        selectedCount={selectedIds.size}
        onArchive={handleBulkArchive}
        onCategorize={handleBulkCategorize}
        onDelete={handleBulkDelete}
        onExport={handleBulkExport}
        onClearSelection={() => setSelectedIds(new Set())}
        loading={isBulkLoading}
      />
    </div>
  )
}

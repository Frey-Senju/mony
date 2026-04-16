'use client'

import React, { useEffect, useState } from 'react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { SummaryCards } from '@/components/dashboard/SummaryCards'
import { TransactionList } from '@/components/dashboard/TransactionList'
import { FilterBar } from '@/components/dashboard/FilterBar'
import { useTransactions, type FilterState } from '@/hooks/useTransactions'
import { useFilter } from '@/hooks/useFilter'
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
  const { user } = useAuth()
  const { transactions, loading, pagination, fetchTransactions, deleteTransaction, reconcileTransaction, changePage } = useTransactions()
  const { filters, updateMultipleFilters, resetFilters, hasActiveFilters } = useFilter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)

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

  // Fetch transactions when filters change
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

  // Calculate summary metrics
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()

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

  const currentBalance = accounts.reduce(
    (sum, account: any) => sum + (account.balance || 0),
    0
  )

  const budgetProgress = 45 // Placeholder, should come from budget API

  const handleEdit = (id: string) => {
    console.log('Edit transaction:', id)
    // TODO: Open edit modal
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
          />
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
    </div>
  )
}

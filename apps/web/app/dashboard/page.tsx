'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUp,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Landmark,
  Plus,
  Wallet,
  X,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { SummaryCards } from '@/components/dashboard/SummaryCards'
import { TransactionList } from '@/components/dashboard/TransactionList'
import { FilterBar, PAYMENT_METHOD_LABELS } from '@/components/dashboard/FilterBar'
import { Charts } from '@/components/dashboard/Charts'
import { TransactionModal } from '@/components/dashboard/TransactionModal'
import { UniversalEditTransactionModal } from '@/components/transactions/UniversalEditTransactionModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { dispatchToast } from '@/components/ui/ToastProvider'
import { BulkActions } from '@/components/dashboard/BulkActions'
import { InstallmentForecast } from '@/components/dashboard/InstallmentForecast'
import { SetupChecklist } from '@/components/dashboard/SetupChecklist'
import { useTransactions, type FilterState, type Transaction } from '@/hooks/useTransactions'
import { useFilter } from '@/hooks/useFilter'
import { useCategories } from '@/hooks/useCategories'
import { useBudgets } from '@/hooks/useBudgets'
import { exportToCSV, exportToJSON, exportToHTML } from '@/utils/export'
import { useAuth } from '@/stores/auth/useAuth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Account {
  id: string
  name: string
  balance?: number
}

interface MonthSummaryData {
  month: string
  previous_month: string
  total_income: number
  total_expenses: number
  total_refunds: number
  net: number
  transaction_count: number
  previous_month_income: number
  previous_month_expenses: number
  previous_month_count: number
  installment_expenses: number
  installment_count: number
  by_payment_method: Array<{ payment_method: string; total: number; count: number }>
}

const PT_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function getCurrentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function shiftYearMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

function formatYearMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${PT_MONTHS[(m || 1) - 1] || ''} ${y}`
}

function formatBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
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

  // Billing / competency month switcher (defaults to current month; can toggle to "all months")
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentYearMonth())
  const [allMonthsMode, setAllMonthsMode] = useState(false)
  const [monthSummary, setMonthSummary] = useState<MonthSummaryData | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | undefined>()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkLoading, setIsBulkLoading] = useState(false)
  const [bulkCatModalOpen, setBulkCatModalOpen] = useState(false)
  const [confirmState, setConfirmState] = useState<{ mode: 'single' | 'bulk'; id?: string } | null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)

  // Greeting based on local hour
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  })()

  // Keyboard shortcut 'N' -> New Transaction + Scroll-to-top visibility
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setSelectedTransaction(undefined)
        setIsModalOpen(true)
      }
    }
    const onScroll = () => setShowScrollTop(window.scrollY > 450)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])
  const [bulkCategoryId, setBulkCategoryId] = useState('')

  const fetchAccounts = useCallback(async () => {
    if (!accessToken) return
    setAccountsLoading(true)
    try {
      const response = await fetch(`${API_URL}/accounts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
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

  const fetchMonthSummary = useCallback(async () => {
    if (!accessToken) return
    try {
      const params = new URLSearchParams({ month: selectedMonth })
      if (filters.accountId) params.set('account_id', filters.accountId)
      const res = await fetch(`${API_URL}/transactions/summary/month?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) {
        setMonthSummary(await res.json())
      }
    } catch {
      // Fallback to client-side calculation below
    }
  }, [accessToken, selectedMonth, filters.accountId])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  useEffect(() => {
    fetchMonthSummary()
  }, [fetchMonthSummary, refreshKey])

  const buildApiFilters = useCallback((): FilterState => {
    const useMonth = !allMonthsMode && !filters.startDate && !filters.endDate
    return {
      accountId: filters.accountId,
      type: filters.type !== 'all' ? (filters.type as 'income' | 'expense') : undefined,
      paymentMethod:
        filters.paymentMethod && filters.paymentMethod !== 'all'
          ? filters.paymentMethod
          : undefined,
      statementMonth: useMonth ? selectedMonth : undefined,
      startDate: filters.startDate,
      endDate: filters.endDate,
      search: filters.search,
      isReconciled:
        filters.isReconciled !== 'all'
          ? (filters.isReconciled as 'reconciled' | 'pending')
          : undefined,
    }
  }, [filters, selectedMonth, allMonthsMode])

  useEffect(() => {
    fetchTransactions(buildApiFilters(), 0, 20)
  }, [filters, selectedMonth, allMonthsMode, fetchTransactions, buildApiFilters])

  // Auto-refresh when transactions are imported via Mony IA Drawer
  useEffect(() => {
    const onImported = () => {
      fetchTransactions(buildApiFilters(), 0, 20)
      fetchAccounts()
      setRefreshKey((k) => k + 1)
    }
    window.addEventListener('mony:transactions-updated', onImported)
    return () => window.removeEventListener('mony:transactions-updated', onImported)
  }, [fetchTransactions, fetchAccounts, buildApiFilters])

  // Summary metrics: prefer exact server-side month summary (handles >20 paginated items!)
  const fallbackSpent = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const fallbackIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const totalSpent = monthSummary ? monthSummary.total_expenses : fallbackSpent
  const totalIncome = monthSummary ? monthSummary.total_income : fallbackIncome
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
      setRefreshKey((k) => k + 1)
      await Promise.all([fetchTransactions(buildApiFilters(), 0, 20), fetchAccounts()])
    } catch (error) {
      console.error('Failed to save transaction:', error)
      throw error
    }
  }

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return
    setConfirmState({ mode: 'bulk' })
  }

  const executeConfirmDelete = async () => {
    if (!confirmState) return
    setIsBulkLoading(true)
    try {
      if (confirmState.mode === 'bulk') {
        const count = selectedIds.size
        for (const id of Array.from(selectedIds)) {
          await deleteTransaction(id)
        }
        setSelectedIds(new Set())
        dispatchToast(`${count} transação(ões) excluída(s).`, 'info')
      } else if (confirmState.id) {
        await deleteTransaction(confirmState.id)
        dispatchToast('Transação excluída.', 'info')
      }
      setRefreshKey((k) => k + 1)
      await fetchAccounts()
    } catch (error) {
      console.error('Failed to delete transactions:', error)
      dispatchToast('Não foi possível excluir a transação.', 'error')
    } finally {
      setIsBulkLoading(false)
      setConfirmState(null)
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

  const handleDelete = (id: string) => {
    setConfirmState({ mode: 'single', id })
  }

  const handleReconcile = async (id: string, reconciled: boolean) => {
    try {
      await reconcileTransaction(id, reconciled)
    } catch (error) {
      console.error('Failed to reconcile transaction:', error)
    }
  }

  const handleSelectMonth = (ym: string) => {
    setSelectedMonth(ym)
    setAllMonthsMode(false)
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Glass Hero Header */}
        <header className="glass-panel flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                Dashboard Financeiro
              </h1>
              <p className="text-slate-600 dark:text-slate-300 mt-1">
                {greeting}, {user?.full_name || 'Usuário'} · pressione <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-white/60 dark:bg-white/10">N</kbd> para novo lançamento
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <Link
                href="/settings/connections"
                className="liquid-btn liquid-btn-glass inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium"
              >
                <Landmark className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                Open Finance
              </Link>
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
          </div>

          {/* Billing Competency Month Switcher + Quick Payment Method Pills */}
          <div className="pt-3 border-t border-white/40 dark:border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap" data-testid="month-switcher">
              <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-white/55 dark:bg-white/10 border border-white/70 dark:border-white/15">
                <button
                  type="button"
                  onClick={() => handleSelectMonth(shiftYearMonth(selectedMonth, -1))}
                  aria-label="Mês anterior"
                  className="p-1.5 rounded-xl hover:bg-white/70 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 transition"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <span className="inline-flex items-center gap-1.5 px-2.5 text-sm font-semibold text-slate-900 dark:text-white min-w-[148px] justify-center">
                  <Calendar className="w-3.5 h-3.5 opacity-75" aria-hidden="true" />
                  {formatYearMonthLabel(selectedMonth)}
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectMonth(shiftYearMonth(selectedMonth, 1))}
                  aria-label="Próximo mês"
                  className="p-1.5 rounded-xl hover:bg-white/70 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 transition"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setAllMonthsMode((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
                  allMonthsMode
                    ? 'liquid-btn-primary border-transparent'
                    : 'bg-white/45 dark:bg-white/5 border-white/60 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-white/15'
                }`}
              >
                {allMonthsMode ? 'Vendo: Todos os meses' : 'Ver todos os meses'}
              </button>

              {selectedMonth !== getCurrentYearMonth() && (
                <button
                  type="button"
                  onClick={() => handleSelectMonth(getCurrentYearMonth())}
                  className="text-xs font-semibold hover:underline px-1.5"
                  style={{ color: 'var(--accent)' }}
                >
                  Voltar ao mês atual
                </button>
              )}
            </div>

            {/* Clickable Payment Method Breakdown Pills */}
            {monthSummary && monthSummary.by_payment_method.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {monthSummary.by_payment_method.slice(0, 4).map((row) => {
                  const active = filters.paymentMethod === row.payment_method
                  return (
                    <button
                      key={row.payment_method}
                      type="button"
                      onClick={() =>
                        updateMultipleFilters({
                          paymentMethod: active ? 'all' : row.payment_method,
                        })
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                        active
                          ? 'liquid-nav-active border-white/80 dark:border-white/25'
                          : 'bg-white/50 dark:bg-white/5 border-white/65 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-white/75 dark:hover:bg-white/15'
                      }`}
                    >
                      <CreditCard className="w-3 h-3 opacity-70" aria-hidden="true" />
                      <span>{PAYMENT_METHOD_LABELS[row.payment_method] || row.payment_method}</span>
                      <span className="font-bold">{formatBRL(row.total)}</span>
                    </button>
                  )
                })}
              </div>
            )}
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

        <SetupChecklist token={accessToken} budgetsCount={budgets.length} />

        {/* Summary Cards */}
        <section aria-labelledby="summary-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="summary-heading" className="text-lg font-semibold text-slate-900 dark:text-white">
              Resumo de {formatYearMonthLabel(selectedMonth)}
            </h2>
            {monthSummary && monthSummary.installment_count > 0 && (
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {monthSummary.installment_count} parcela(s) neste mês ({formatBRL(monthSummary.installment_expenses)})
              </span>
            )}
          </div>
          <SummaryCards
            totalSpent={totalSpent}
            totalIncome={totalIncome}
            currentBalance={currentBalance}
            budgetProgress={budgetProgress}
            budgetsExceeded={budgetsExceeded}
            loading={loading}
            previousMonthData={
              monthSummary && monthSummary.previous_month_count > 0
                ? {
                    totalSpent: monthSummary.previous_month_expenses,
                    totalIncome: monthSummary.previous_month_income,
                    currentBalance,
                  }
                : undefined
            }
          />
        </section>

        {/* Installment Future Commitment Forecast */}
        <section aria-labelledby="installments-heading">
          <h2 id="installments-heading" className="sr-only">
            Projeção de Parcelas Futuras
          </h2>
          <InstallmentForecast
            token={accessToken}
            startMonth={selectedMonth}
            refreshKey={refreshKey}
            onSelectMonth={handleSelectMonth}
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
            externalPaymentMethod={filters.paymentMethod}
          />
        </section>

        {/* Transaction List */}
        <section aria-labelledby="transactions-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="transactions-heading" className="text-lg font-semibold text-slate-900 dark:text-white">
              Transações {!allMonthsMode ? `· ${formatYearMonthLabel(selectedMonth)}` : '(Todos os meses)'}
            </h2>
          </div>
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

      {/* Transaction Modal (Universal Editor with Tags & Split when editing!) */}
      {isModalOpen && selectedTransaction && accessToken ? (
        <UniversalEditTransactionModal
          token={accessToken}
          transaction={selectedTransaction}
          accounts={accounts}
          categories={categories.map((c) => c.name)}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedTransaction(undefined)
          }}
          onSaved={async () => {
            setRefreshKey((k) => k + 1)
            dispatchToast('Transação atualizada com sucesso!', 'success')
            await Promise.all([fetchTransactions(buildApiFilters(), 0, 20), fetchAccounts()])
          }}
        />
      ) : (
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
      )}

      {/* Accessible Liquid Glass Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(confirmState)}
        title={
          confirmState?.mode === 'bulk'
            ? `Excluir ${selectedIds.size} transação(ões)?`
            : 'Excluir esta transação?'
        }
        description="Esta ação remove o lançamento e recalcula o saldo da conta automaticamente."
        confirmLabel="Excluir"
        variant="danger"
        loading={isBulkLoading}
        onConfirm={executeConfirmDelete}
        onCancel={() => setConfirmState(null)}
      />

      {/* Subtle Scroll-to-Top Floating Button */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Voltar ao topo"
          className="fixed bottom-20 lg:bottom-6 left-4 lg:left-auto lg:right-6 z-30 liquid-btn liquid-btn-glass p-2.5 rounded-full shadow-lg no-print"
        >
          <ArrowUp className="w-4 h-4" aria-hidden="true" />
        </button>
      )}

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

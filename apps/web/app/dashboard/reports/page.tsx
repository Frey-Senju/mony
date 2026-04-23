'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { MonthlySummaryCard } from '@/components/reports/MonthlySummaryCard'
import { CategoryBreakdownChart } from '@/components/reports/CategoryBreakdownChart'
import { shiftMonth, useReports } from '@/hooks/useReports'
import { useAuth } from '@/stores/auth/useAuth'

/**
 * /dashboard/reports — monthly financial reports.
 *
 * Renders a month selector, a three-card monthly summary, and a category
 * breakdown pie chart. Both datasets are fetched in parallel via
 * ``useReports`` on mount and on every month change.
 */

const MONTH_LABELS_PT_BR = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

export default function ReportsPage() {
  return (
    <PrivateRoute>
      <ReportsContent />
    </PrivateRoute>
  )
}

function ReportsContent() {
  const auth = useAuth()
  const { user } = auth
  const token = auth.tokens?.access_token

  // Default to the current month.
  const now = useMemo(() => new Date(), [])
  const [year, setYear] = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth() + 1)

  const { summary, breakdown, loading, error, fetchReports } = useReports(token)

  // Fetch on mount and whenever the selected month changes or the token arrives.
  useEffect(() => {
    if (!token) return
    fetchReports(year, month)
  }, [token, year, month, fetchReports])

  const handleMonthInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // <input type="month"> emits "YYYY-MM".
    const value = e.target.value
    if (!value) return
    const [y, m] = value.split('-').map((v) => parseInt(v, 10))
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      setYear(y)
      setMonth(m)
    }
  }

  const handlePrevMonth = () => {
    const next = shiftMonth(year, month, -1)
    setYear(next.year)
    setMonth(next.month)
  }

  const handleNextMonth = () => {
    const next = shiftMonth(year, month, 1)
    setYear(next.year)
    setMonth(next.month)
  }

  // Format YYYY-MM for <input type="month">
  const monthInputValue = `${year}-${String(month).padStart(2, '0')}`
  const monthLabel = `${MONTH_LABELS_PT_BR[month - 1]} de ${year}`

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1
                className="text-3xl font-bold text-slate-900 dark:text-slate-100"
                data-testid="reports-title"
              >
                Relatórios financeiros
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                {user?.full_name
                  ? `${user.full_name} — ${monthLabel}`
                  : monthLabel}
              </p>
            </div>

            <Link
              href="/dashboard"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              data-testid="back-to-dashboard"
            >
              ← Voltar ao dashboard
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Month Selector */}
        <section
          className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3 flex-wrap"
          data-testid="month-selector"
        >
          <button
            type="button"
            onClick={handlePrevMonth}
            className="px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            data-testid="month-prev"
            aria-label="Mês anterior"
          >
            ← Anterior
          </button>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <span>Mês:</span>
            <input
              type="month"
              value={monthInputValue}
              onChange={handleMonthInputChange}
              className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              data-testid="month-input"
            />
          </label>

          <button
            type="button"
            onClick={handleNextMonth}
            className="px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            data-testid="month-next"
            aria-label="Próximo mês"
          >
            Próximo →
          </button>

          <span
            className="ml-auto text-sm text-slate-500 dark:text-slate-400"
            data-testid="selected-month-label"
          >
            {monthLabel}
          </span>
        </section>

        {/* Error banner */}
        {error && (
          <div
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300"
            data-testid="reports-error"
          >
            Erro ao carregar relatórios: {error}
          </div>
        )}

        {/* Monthly Summary */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Resumo do mês
          </h2>
          <MonthlySummaryCard
            totalIncome={summary?.total_income ?? 0}
            totalExpenses={summary?.total_expenses ?? 0}
            netBalance={summary?.net_balance ?? 0}
            loading={loading}
          />
          {!loading &&
            summary &&
            summary.total_income === 0 &&
            summary.total_expenses === 0 && (
              <div
                className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-blue-700 dark:text-blue-300"
                data-testid="reports-empty-state"
              >
                Nenhuma transação encontrada em {monthLabel.toLowerCase()}.
              </div>
            )}
        </section>

        {/* Category Breakdown */}
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Detalhamento por categoria
          </h2>
          <CategoryBreakdownChart
            items={breakdown?.items ?? []}
            totalExpenses={breakdown?.total_expenses ?? 0}
            loading={loading}
          />
        </section>
      </div>
    </div>
  )
}

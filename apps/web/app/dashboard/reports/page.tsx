'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { MonthlySummaryCard } from '@/components/reports/MonthlySummaryCard'
import { CategoryBreakdownChart } from '@/components/reports/CategoryBreakdownChart'
import { shiftMonth, useReports } from '@/hooks/useReports'
import { useAuth } from '@/stores/auth/useAuth'
import { exportReportToCSV } from '@/utils/export'

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
  const pathname = usePathname()

  const now = useMemo(() => new Date(), [])
  const [year, setYear] = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth() + 1)

  // Date range mode
  const [mode, setMode] = useState<'month' | 'range'>('month')
  const todayISO = now.toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState<string>(todayISO.slice(0, 8) + '01')
  const [endDate, setEndDate] = useState<string>(todayISO)
  const [pendingStart, setPendingStart] = useState<string>(startDate)
  const [pendingEnd, setPendingEnd] = useState<string>(endDate)
  const [rangeApplied, setRangeApplied] = useState(false)

  const { summary, breakdown, loading, error, fetchReports } = useReports(token)

  useEffect(() => {
    if (!token) return
    if (mode === 'month') {
      fetchReports({ year, month })
    } else if (rangeApplied) {
      fetchReports({ start_date: startDate, end_date: endDate })
    }
  }, [token, year, month, mode, startDate, endDate, rangeApplied, fetchReports])

  const applyRange = () => {
    setStartDate(pendingStart)
    setEndDate(pendingEnd)
    setRangeApplied(true)
  }

  const switchMode = (next: 'month' | 'range') => {
    setMode(next)
    setRangeApplied(false)
  }

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

            <div className="flex items-center gap-4">
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1" data-testid="report-tabs">
                <Link
                  href="/dashboard/reports"
                  className={`px-4 py-1.5 text-sm rounded-md font-medium transition ${
                    pathname === '/dashboard/reports'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  Mensal
                </Link>
                <Link
                  href="/dashboard/reports/annual"
                  className={`px-4 py-1.5 text-sm rounded-md font-medium transition ${
                    pathname === '/dashboard/reports/annual'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  Anual
                </Link>
              </div>
              <Link
                href="/dashboard"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                data-testid="back-to-dashboard"
              >
                ← Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Period Mode Toggle */}
        <section className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-4">
          <div className="flex gap-2" data-testid="mode-toggle">
            <button
              type="button"
              onClick={() => switchMode('month')}
              className={`px-4 py-2 text-sm rounded-md font-medium transition ${
                mode === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              data-testid="mode-month"
            >
              Por Mês
            </button>
            <button
              type="button"
              onClick={() => switchMode('range')}
              className={`px-4 py-2 text-sm rounded-md font-medium transition ${
                mode === 'range'
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              data-testid="mode-range"
            >
              Período
            </button>
          </div>

          {mode === 'month' && (
            <div className="flex items-center gap-3 flex-wrap" data-testid="month-selector">
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
              <span className="ml-auto text-sm text-slate-500 dark:text-slate-400" data-testid="selected-month-label">
                {monthLabel}
              </span>
            </div>
          )}

          {mode === 'range' && (
            <div className="flex items-end gap-3 flex-wrap" data-testid="date-range-picker">
              <label className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-300">
                <span>De:</span>
                <input
                  type="date"
                  value={pendingStart}
                  onChange={(e) => setPendingStart(e.target.value)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  data-testid="range-start"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-300">
                <span>Até:</span>
                <input
                  type="date"
                  value={pendingEnd}
                  onChange={(e) => setPendingEnd(e.target.value)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  data-testid="range-end"
                />
              </label>
              <button
                type="button"
                onClick={applyRange}
                disabled={!pendingStart || !pendingEnd || pendingStart > pendingEnd}
                className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="apply-range"
              >
                Aplicar
              </button>
              {rangeApplied && (
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {startDate} → {endDate}
                </span>
              )}
            </div>
          )}
        </section>

        {/* Export Actions */}
        <section className="flex gap-3 no-print" data-testid="export-actions">
          <button
            type="button"
            onClick={() => {
              exportReportToCSV(
                {
                  total_income: summary?.total_income ?? 0,
                  total_expenses: summary?.total_expenses ?? 0,
                  net_balance: summary?.net_balance ?? 0,
                },
                (breakdown?.items ?? []).map((item) => ({
                  name: item.category_name,
                  amount: item.total,
                  percentage: item.percentage,
                })),
                mode === 'month' ? monthLabel : `${startDate} → ${endDate}`
              )
            }}
            disabled={loading || (!summary && !breakdown)}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="export-csv"
          >
            ↓ Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            data-testid="print-pdf"
          >
            🖨 Imprimir / PDF
          </button>
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

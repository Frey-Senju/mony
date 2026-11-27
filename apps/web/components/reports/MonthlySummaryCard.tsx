'use client'

import React from 'react'
import { Copy, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { dispatchToast } from '@/components/ui/ToastProvider'

export interface MonthlySummaryCardProps {
  totalIncome: number
  totalExpenses: number
  netBalance: number
  loading?: boolean
}

function formatBRL(value: number): string {
  return (Number(value) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

async function copyAmount(label: string, formatted: string) {
  try {
    await navigator.clipboard.writeText(formatted)
    dispatchToast(`${label} copiado: ${formatted}`, 'info', { durationMs: 2500 })
  } catch {
    // clipboard unavailable
  }
}

export function MonthlySummaryCard({
  totalIncome,
  totalExpenses,
  netBalance,
  loading = false,
}: MonthlySummaryCardProps) {
  if (loading) {
    return (
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
        data-testid="monthly-summary-loading"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 glass-card animate-pulse" />
        ))}
      </div>
    )
  }

  const balancePositive = netBalance >= 0
  const incomeFormatted = `R$ ${formatBRL(totalIncome)}`
  const expenseFormatted = `-R$ ${formatBRL(totalExpenses)}`
  const netFormatted = `${balancePositive ? '' : '-'}R$ ${formatBRL(Math.abs(netBalance))}`
  const savingsRate = totalIncome > 0 ? Math.round((netBalance / totalIncome) * 100) : null

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-3 gap-4"
      data-testid="monthly-summary"
    >
      <div
        className="glass-card p-6 border border-emerald-500/25 transition-all hover:shadow-lg group"
        data-testid="summary-income"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Receitas</p>
            <div className="flex items-center gap-1.5 mt-2">
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums money-value truncate">
                {incomeFormatted}
              </p>
              <button
                type="button"
                onClick={() => copyAmount('Receitas', incomeFormatted)}
                title="Copiar valor"
                aria-label="Copiar total de receitas"
                className="no-print p-1 rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-slate-900 dark:hover:text-white transition"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Total de entradas no mês
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div
        className="glass-card p-6 border border-rose-500/25 transition-all hover:shadow-lg group"
        data-testid="summary-expenses"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Despesas</p>
            <div className="flex items-center gap-1.5 mt-2">
              <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 tabular-nums money-value truncate">
                {expenseFormatted}
              </p>
              <button
                type="button"
                onClick={() => copyAmount('Despesas', expenseFormatted)}
                title="Copiar valor"
                aria-label="Copiar total de despesas"
                className="no-print p-1 rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-slate-900 dark:hover:text-white transition"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Total de saídas no mês
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <TrendingDown className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div
        className={`glass-card p-6 border transition-all hover:shadow-lg group ${
          balancePositive ? 'border-blue-500/25' : 'border-rose-500/35'
        }`}
        data-testid="summary-net-balance"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Saldo líquido</p>
            <div className="flex items-center gap-1.5 mt-2">
              <p
                className={`text-2xl font-extrabold tabular-nums money-value truncate ${
                  balancePositive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {netFormatted}
              </p>
              <button
                type="button"
                onClick={() => copyAmount('Saldo líquido', netFormatted)}
                title="Copiar valor"
                aria-label="Copiar saldo líquido"
                className="no-print p-1 rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-slate-900 dark:hover:text-white transition"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {savingsRate !== null
                ? savingsRate >= 0
                  ? `Taxa de economia: ${savingsRate}% da renda`
                  : `Gastos ${Math.abs(savingsRate)}% acima da renda`
                : 'Receitas menos despesas'}
            </p>
          </div>
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              balancePositive
                ? 'bg-blue-500/15 border-blue-500/25 text-blue-600 dark:text-blue-400'
                : 'bg-rose-500/15 border-rose-500/25 text-rose-600 dark:text-rose-400'
            }`}
          >
            <Wallet className="w-5 h-5" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import React from 'react'
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react'

/**
 * MonthlySummaryCard — three-card grid showing income, expenses, and net
 * balance for a selected month. Visual tokens match
 * ``components/dashboard/SummaryCards.tsx`` (Story 1.5) for consistency
 * across the dashboard.
 */

export interface MonthlySummaryCardProps {
  totalIncome: number
  totalExpenses: number
  netBalance: number
  loading?: boolean
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
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
          <div
            key={i}
            className="h-28 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse"
          />
        ))}
      </div>
    )
  }

  const balancePositive = netBalance >= 0

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-3 gap-4"
      data-testid="monthly-summary"
    >
      <div
        className="border rounded-lg p-6 transition-all hover:shadow-md bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
        data-testid="summary-income"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Receitas
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
              R$ {formatBRL(totalIncome)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              Total de entradas no mês
            </p>
          </div>
          <div className="text-green-600 dark:text-green-400 flex-shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div
        className="border rounded-lg p-6 transition-all hover:shadow-md bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
        data-testid="summary-expenses"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Despesas
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
              -R$ {formatBRL(totalExpenses)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              Total de saídas no mês
            </p>
          </div>
          <div className="text-red-600 dark:text-red-400 flex-shrink-0">
            <TrendingDown className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div
        className={`border rounded-lg p-6 transition-all hover:shadow-md ${
          balancePositive
            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        }`}
        data-testid="summary-net-balance"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Saldo líquido
            </p>
            <p
              className={`text-2xl font-bold mt-2 ${
                balancePositive
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-red-700 dark:text-red-300'
              }`}
            >
              {balancePositive ? '' : '-'}R$ {formatBRL(Math.abs(netBalance))}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              Receitas − despesas
            </p>
          </div>
          <div
            className={`flex-shrink-0 ${
              balancePositive
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            <Wallet className="w-6 h-6" />
          </div>
        </div>
      </div>
    </div>
  )
}

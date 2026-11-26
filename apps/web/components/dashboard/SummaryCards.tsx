'use client'

import React from 'react'
import Link from 'next/link'
import { TrendingDown, TrendingUp, Wallet, Target } from 'lucide-react'

interface SummaryCard {
  title: string
  value: string | number
  trend?: number
  invertTrendColor?: boolean
  progressPct?: number
  isMoney?: boolean
  icon: React.ReactNode
  color: 'blue' | 'green' | 'red' | 'purple'
  subtitle?: string
  href?: string
}

export interface SummaryCardsProps {
  totalSpent: number
  totalIncome: number
  currentBalance: number
  budgetProgress?: number
  budgetsExceeded?: number
  loading?: boolean
  previousMonthData?: {
    totalSpent: number
    totalIncome: number
    currentBalance?: number
  }
}

export function SummaryCards({
  totalSpent,
  totalIncome,
  currentBalance,
  budgetProgress = 0,
  budgetsExceeded = 0,
  loading = false,
  previousMonthData,
}: SummaryCardsProps) {
  const iconContainers = {
    blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25',
    green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
    red: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/25',
    purple: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25',
  }

  const calculateTrend = (current: number, previous: number): number | undefined => {
    if (!previousMonthData || previous === 0) return undefined
    return Math.round(((current - previous) / previous) * 100)
  }

  const spentTrend = calculateTrend(totalSpent, previousMonthData?.totalSpent || 0)
  const incomeTrend = calculateTrend(totalIncome, previousMonthData?.totalIncome || 0)
  const balanceTrend = previousMonthData?.currentBalance
    ? calculateTrend(currentBalance, previousMonthData.currentBalance)
    : undefined

  const clampedBudget = Math.max(0, Math.min(100, Math.round(budgetProgress)))

  const cards: SummaryCard[] = [
    {
      title: 'Gastos este mês',
      value: `-R$ ${Math.abs(totalSpent).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      trend: spentTrend,
      invertTrendColor: true,
      isMoney: true,
      icon: <TrendingDown className="w-5 h-5" aria-hidden="true" />,
      color: 'red',
      subtitle: previousMonthData ? 'Despesas totais' : 'Primeiro mês de dados',
    },
    {
      title: 'Renda este mês',
      value: `R$ ${totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      trend: incomeTrend,
      isMoney: true,
      icon: <TrendingUp className="w-5 h-5" aria-hidden="true" />,
      color: 'green',
      subtitle: previousMonthData ? 'Receitas totais' : 'Primeiro mês de dados',
    },
    {
      title: 'Saldo disponível',
      value: `R$ ${currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      trend: balanceTrend,
      isMoney: true,
      icon: <Wallet className="w-5 h-5" aria-hidden="true" />,
      color: 'blue',
      subtitle: 'Todas as contas',
      href: '/dashboard/accounts',
    },
    {
      title: 'Budgets em alerta',
      value:
        budgetsExceeded > 0
          ? `${budgetsExceeded} ultrapassado${budgetsExceeded > 1 ? 's' : ''}`
          : `${clampedBudget}%`,
      progressPct: clampedBudget,
      icon: <Target className="w-5 h-5" aria-hidden="true" />,
      color: 'purple',
      subtitle: budgetsExceeded > 0 ? 'Ver budgets' : `${100 - clampedBudget}% restante`,
      href: '/dashboard/budgets',
    },
  ]

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" aria-busy="true">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 glass-card animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const inner = (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  {card.title}
                </p>
                <p
                  className={`text-2xl font-bold text-slate-900 dark:text-white mt-2 truncate ${
                    card.isMoney ? 'money-value' : ''
                  }`}
                >
                  {card.value}
                </p>
                {card.subtitle && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {card.subtitle}
                  </p>
                )}
              </div>
              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconContainers[card.color]}`}
              >
                {card.icon}
              </div>
            </div>
            {card.progressPct !== undefined ? (
              <div className="mt-4 space-y-1">
                <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      card.progressPct >= 100
                        ? 'bg-rose-500'
                        : card.progressPct >= 80
                        ? 'bg-amber-500'
                        : 'bg-purple-500'
                    }`}
                    style={{ width: `${card.progressPct}%` }}
                  />
                </div>
              </div>
            ) : (
              card.trend !== undefined && (
                <div className="mt-4 flex items-center gap-1 text-xs">
                  <span
                    className={
                      (card.invertTrendColor ? card.trend <= 0 : card.trend >= 0)
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'text-rose-600 dark:text-rose-400 font-semibold'
                    }
                  >
                    {card.trend > 0 ? '+' : ''}
                    {card.trend}%
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">vs. mês anterior</span>
                </div>
              )
            )}
          </>
        )

        if (card.href) {
          return (
            <Link
              key={card.title}
              href={card.href}
              className="glass-card p-6 block hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-primary-600"
            >
              {inner}
            </Link>
          )
        }

        return (
          <div key={card.title} className="glass-card p-6">
            {inner}
          </div>
        )
      })}
    </div>
  )
}

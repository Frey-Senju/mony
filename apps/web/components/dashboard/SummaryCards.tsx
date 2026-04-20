'use client'

import React from 'react'
import { TrendingDown, TrendingUp, Wallet, Target } from 'lucide-react'

interface SummaryCard {
  title: string
  value: string | number
  trend?: number
  icon: React.ReactNode
  color: 'blue' | 'green' | 'red' | 'purple'
  subtitle?: string
}

interface SummaryCardsProps {
  totalSpent: number
  totalIncome: number
  currentBalance: number
  budgetProgress?: number
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
  loading = false,
  previousMonthData,
}: SummaryCardsProps) {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    purple:
      'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
  }

  const iconColors = {
    blue: 'text-blue-600 dark:text-blue-400',
    green: 'text-green-600 dark:text-green-400',
    red: 'text-red-600 dark:text-red-400',
    purple: 'text-purple-600 dark:text-purple-400',
  }

  // Calculate trend percentages based on previous month data
  const calculateTrend = (current: number, previous: number): number | undefined => {
    if (!previousMonthData || previous === 0) return undefined
    return Math.round(((current - previous) / previous) * 100)
  }

  const spentTrend = calculateTrend(totalSpent, previousMonthData?.totalSpent || 0)
  const incomeTrend = calculateTrend(totalIncome, previousMonthData?.totalIncome || 0)
  const balanceTrend = previousMonthData?.currentBalance
    ? calculateTrend(currentBalance, previousMonthData.currentBalance)
    : undefined

  const cards: SummaryCard[] = [
    {
      title: 'Gastos este mês',
      value: `-R$ ${Math.abs(totalSpent).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      trend: spentTrend,
      icon: <TrendingDown className="w-6 h-6" />,
      color: 'red',
      subtitle: previousMonthData ? 'Despesas totais' : 'Primeiro mês de dados',
    },
    {
      title: 'Renda este mês',
      value: `R$ ${totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      trend: incomeTrend,
      icon: <TrendingUp className="w-6 h-6" />,
      color: 'green',
      subtitle: previousMonthData ? 'Receitas totais' : 'Primeiro mês de dados',
    },
    {
      title: 'Saldo disponível',
      value: `R$ ${currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      trend: balanceTrend,
      icon: <Wallet className="w-6 h-6" />,
      color: 'blue',
      subtitle: 'Conta corrente',
    },
    {
      title: 'Meta orçamentária',
      value: `${budgetProgress}%`,
      trend: budgetProgress > 80 ? -5 : 2,
      icon: <Target className="w-6 h-6" />,
      color: 'purple',
      subtitle: `${100 - budgetProgress}% restante`,
    },
  ]

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-24 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className={`border rounded-lg p-6 transition-all hover:shadow-md ${colorClasses[card.color]}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {card.title}
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
                {card.value}
              </p>
              {card.subtitle && (
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  {card.subtitle}
                </p>
              )}
            </div>
            <div className={`${iconColors[card.color]} flex-shrink-0`}>
              {card.icon}
            </div>
          </div>
          {card.trend !== undefined && (
            <div className="mt-4 flex items-center gap-1 text-xs">
              <span
                className={
                  card.trend >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }
              >
                {card.trend > 0 ? '+' : ''}{card.trend}%
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                vs. mês anterior
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

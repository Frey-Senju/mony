'use client'

import React, { useMemo } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useAppearance } from '@/app/_theme/provider'

interface Transaction {
  id: string
  amount: number
  type: 'income' | 'expense' | 'transfer' | 'investment' | 'refund'
  transaction_date: string
  category_id?: string
  category_name?: string
  category_color?: string | null
  category_icon?: string | null
}

export interface AnnualMonthPoint {
  ym: string
  short_label: string
  income: number
  expenses: number
}

export interface ChartCategoryMeta {
  name: string
  color: string
  icon?: string
}

function parseLocalDate(dateStr: string): Date {
  return new Date(`${(dateStr || '').slice(0, 10)}T12:00:00`)
}

export interface ChartsProps {
  transactions: Transaction[]
  loading?: boolean
  annualMonths?: AnnualMonthPoint[]
  categories?: ChartCategoryMeta[]
  selectedMonth?: string
  activeCategory?: string | null
  onSelectCategory?: (categoryName: string | null) => void
}

export function Charts({
  transactions,
  loading = false,
  annualMonths,
  categories: userCategories = [],
  selectedMonth,
  activeCategory,
  onSelectCategory,
}: ChartsProps) {
  const { chartPalette } = useAppearance()
  const COLORS = chartPalette

  const catMetaByName = useMemo(() => {
    const map: Record<string, ChartCategoryMeta> = {}
    for (const c of userCategories) {
      map[c.name.toLowerCase()] = c
    }
    return map
  }, [userCategories])

  // Monthly spending trend (prefers full 12-month real series when available)
  const monthlyTrendData = useMemo(() => {
    if (annualMonths && annualMonths.length > 0) {
      return annualMonths.map((m) => ({
        month: m.short_label,
        ym: m.ym,
        Despesas: Math.abs(Number(m.expenses) || 0),
        Receitas: Number(m.income) || 0,
      }))
    }

    const months: { [key: string]: { expense: number; income: number } } = {}
    for (let i = 11; i >= 0; i--) {
      const date = new Date()
      date.setMonth(date.getMonth() - i)
      const key = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      months[key] = { expense: 0, income: 0 }
    }

    transactions.forEach((tx) => {
      const date = parseLocalDate(tx.transaction_date)
      const key = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      const amt = Number(tx.amount) || 0
      if (months[key]) {
        if (tx.type === 'expense') {
          months[key].expense += amt
        } else if (tx.type === 'income') {
          months[key].income += amt
        }
      }
    })

    return Object.entries(months).map(([month, data]) => ({
      month,
      ym: '',
      Despesas: Math.abs(data.expense),
      Receitas: data.income,
    }))
  }, [transactions, annualMonths])

  // Category breakdown using real user colors & emojis
  const categoryBreakdownData = useMemo(() => {
    const totals: Record<string, { value: number; color?: string; icon?: string }> = {}
    const legacyMap: Record<string, string> = {
      '1': 'Alimentação',
      '2': 'Transporte',
      '3': 'Saúde',
      '4': 'Lazer',
      '5': 'Educação',
      '6': 'Trabalho',
      '7': 'Casa',
      '8': 'Outros',
    }

    transactions
      .filter((tx) => tx.type === 'expense')
      .forEach((tx) => {
        const name =
          tx.category_name ||
          (tx.category_id ? legacyMap[tx.category_id] || 'Outros' : 'Sem categoria')
        const meta = catMetaByName[name.toLowerCase()]
        if (!totals[name]) {
          totals[name] = {
            value: 0,
            color: tx.category_color || meta?.color,
            icon: tx.category_icon || meta?.icon,
          }
        }
        totals[name].value += Number(tx.amount) || 0
      })

    const sorted = Object.entries(totals)
      .filter(([, entry]) => entry.value > 0)
      .sort((a, b) => b[1].value - a[1].value)

    const grandTotal = sorted.reduce((s, [, e]) => s + e.value, 0) || 1

    return sorted.map(([name, entry], index) => ({
      name,
      value: Math.abs(entry.value),
      pct: Math.round((entry.value / grandTotal) * 1000) / 10,
      color: entry.color || COLORS[index % COLORS.length],
      icon: entry.icon || '🏷️',
    }))
  }, [transactions, catMetaByName, COLORS])

  const totalCategoryExpenses = useMemo(
    () => categoryBreakdownData.reduce((s, c) => s + c.value, 0),
    [categoryBreakdownData]
  )

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-modal p-3 text-xs space-y-1">
          <p className="font-bold text-slate-900 dark:text-slate-100">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="font-semibold tabular-nums money-value">
              {entry.name}: R${' '}
              {Number(entry.value || 0).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" aria-busy="true">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-80 glass-card animate-pulse" />
        ))}
      </div>
    )
  }

  const fmt = (v: number) =>
    v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Monthly Spending Trend (12m real series) */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            Tendência de Gastos (12 meses)
          </h3>
          {selectedMonth && annualMonths && annualMonths.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/60 dark:bg-white/10 text-slate-600 dark:text-slate-300">
              Ano {selectedMonth.slice(0, 4)}
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={monthlyTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
            <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '11px' }} />
            <YAxis stroke="#64748b" style={{ fontSize: '11px' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="Despesas"
              stroke="#EF4444"
              strokeWidth={2.5}
              dot={{ fill: '#EF4444', r: 3.5 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="Receitas"
              stroke="#10B981"
              strokeWidth={2.5}
              dot={{ fill: '#10B981', r: 3.5 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Income vs Expense Comparison (12m real series) */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            Comparação Receita vs Despesa
          </h3>
          {selectedMonth && annualMonths && annualMonths.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/60 dark:bg-white/10 text-slate-600 dark:text-slate-300">
              Série Anual
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthlyTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
            <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '11px' }} />
            <YAxis stroke="#64748b" style={{ fontSize: '11px' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="Receitas" fill="#10B981" radius={[6, 6, 0, 0]} />
            <Bar dataKey="Despesas" fill="#EF4444" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category Breakdown — Clean Donut + Interactive Colored Emoji Legend */}
      {categoryBreakdownData.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
              Gastos por Categoria
            </h3>
            {onSelectCategory && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Clique para filtrar a planilha
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="relative h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryBreakdownData}
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={88}
                    paddingAngle={2}
                    dataKey="value"
                    onClick={(entry) => {
                      if (!onSelectCategory || !entry?.name) return
                      const next = activeCategory === entry.name ? null : entry.name
                      onSelectCategory(next)
                    }}
                    className={onSelectCategory ? 'cursor-pointer' : undefined}
                  >
                    {categoryBreakdownData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        opacity={activeCategory && activeCategory !== entry.name ? 0.38 : 1}
                        stroke="rgba(255,255,255,0.65)"
                        strokeWidth={1.5}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `R$ ${fmt(Number(value || 0))}`}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                  Total
                </span>
                <span className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums money-value">
                  R$ {fmt(totalCategoryExpenses)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {categoryBreakdownData.map((cat) => {
                const isSelected = activeCategory?.toLowerCase() === cat.name.toLowerCase()
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => onSelectCategory?.(isSelected ? null : cat.name)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-xl transition border ${
                      isSelected
                        ? 'bg-white/80 dark:bg-white/15 border-blue-400 shadow-sm'
                        : 'border-transparent hover:bg-white/50 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span aria-hidden="true">{cat.icon}</span>
                        <span className="truncate">{cat.name}</span>
                      </span>
                      <span className="font-bold tabular-nums whitespace-nowrap text-slate-900 dark:text-white money-value">
                        R$ {fmt(cat.value)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, cat.pct)}%`, backgroundColor: cat.color }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400 w-9 text-right">
                        {cat.pct.toFixed(1).replace('.', ',')}%
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats (Liquid Glass) */}
      <div className="glass-card p-6 flex flex-col justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Resumo Financeiro
          </h3>
          <div className="space-y-3">
            {(() => {
              const totalExpense = transactions
                .filter((tx) => tx.type === 'expense')
                .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
              const totalIncome = transactions
                .filter((tx) => tx.type === 'income')
                .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
              const balance = totalIncome - totalExpense
              const savingsRate = totalIncome > 0 ? Math.round((balance / totalIncome) * 100) : null

              return (
                <>
                  <div className="flex items-center justify-between gap-2 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Total de Despesas
                    </span>
                    <span className="font-bold tabular-nums whitespace-nowrap text-rose-600 dark:text-rose-400 money-value">
                      -R$ {fmt(totalExpense)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Total de Receitas
                    </span>
                    <span className="font-bold tabular-nums whitespace-nowrap text-emerald-600 dark:text-emerald-400 money-value">
                      R$ {fmt(totalIncome)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Saldo
                      </span>
                      {savingsRate !== null && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {savingsRate >= 0
                            ? `Taxa de economia: ${savingsRate}% da renda`
                            : `Gastos ${Math.abs(savingsRate)}% acima da renda`}
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-base font-extrabold tabular-nums whitespace-nowrap money-value ${
                        balance >= 0
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {balance < 0 ? `-R$ ${fmt(Math.abs(balance))}` : `R$ ${fmt(balance)}`}
                    </span>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}

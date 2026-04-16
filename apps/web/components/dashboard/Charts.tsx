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

interface Transaction {
  id: string
  amount: number
  type: 'income' | 'expense'
  transaction_date: string
}

interface ChartsProps {
  transactions: Transaction[]
  loading?: boolean
}

export function Charts({ transactions, loading = false }: ChartsProps) {
  // Calculate monthly spending trend (last 12 months)
  const monthlyTrendData = useMemo(() => {
    const months: { [key: string]: { expense: number; income: number } } = {}

    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const date = new Date()
      date.setMonth(date.getMonth() - i)
      const key = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      months[key] = { expense: 0, income: 0 }
    }

    // Aggregate transactions by month
    transactions.forEach((tx) => {
      const date = new Date(tx.transaction_date)
      const key = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      if (months[key]) {
        if (tx.type === 'expense') {
          months[key].expense += tx.amount
        } else {
          months[key].income += tx.amount
        }
      }
    })

    return Object.entries(months).map(([month, data]) => ({
      month,
      Despesas: Math.abs(data.expense),
      Receitas: data.income,
    }))
  }, [transactions])

  // Calculate category breakdown (dummy categories for now)
  const categoryBreakdownData = useMemo(() => {
    const categories: { [key: string]: number } = {
      'Alimentação': 0,
      'Transporte': 0,
      'Saúde': 0,
      'Lazer': 0,
      'Outros': 0,
    }

    // In real app, this would use actual category data from transactions
    transactions
      .filter((tx) => tx.type === 'expense')
      .forEach((tx) => {
        // Random category assignment for demo
        const categoryKeys = Object.keys(categories)
        const randomCategory = categoryKeys[Math.floor(Math.random() * categoryKeys.length)]
        categories[randomCategory] += tx.amount
      })

    return Object.entries(categories)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value: Math.abs(value),
      }))
  }, [transactions])

  // Income vs Expense comparison (last 12 months)
  const incomeVsExpenseData = useMemo(() => {
    const months: { [key: string]: { expense: number; income: number } } = {}

    for (let i = 11; i >= 0; i--) {
      const date = new Date()
      date.setMonth(date.getMonth() - i)
      const key = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      months[key] = { expense: 0, income: 0 }
    }

    transactions.forEach((tx) => {
      const date = new Date(tx.transaction_date)
      const key = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      if (months[key]) {
        if (tx.type === 'expense') {
          months[key].expense += tx.amount
        } else {
          months[key].income += tx.amount
        }
      }
    })

    return Object.entries(months).map(([month, data]) => ({
      month,
      Receitas: data.income,
      Despesas: Math.abs(data.expense),
    }))
  }, [transactions])

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {label}
          </p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: R$ {entry.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <div
            key={i}
            className="h-80 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Monthly Spending Trend */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Tendência de Gastos (12 meses)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyTrendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="month"
              stroke="#64748b"
              style={{ fontSize: '12px' }}
            />
            <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="Despesas"
              stroke="#EF4444"
              strokeWidth={2}
              dot={{ fill: '#EF4444', r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="Receitas"
              stroke="#10B981"
              strokeWidth={2}
              dot={{ fill: '#10B981', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Income vs Expense Comparison */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Comparação Receita vs Despesa
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={incomeVsExpenseData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="month"
              stroke="#64748b"
              style={{ fontSize: '12px' }}
            />
            <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="Receitas" fill="#10B981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Despesas" fill="#EF4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category Breakdown */}
      {categoryBreakdownData.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Gastos por Categoria
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryBreakdownData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => (
                  <span className="text-xs">
                    {name}: R$ {value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </span>
                )}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {categoryBreakdownData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) =>
                  `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary Stats */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Resumo Financeiro
        </h3>
        <div className="space-y-4">
          {(() => {
            const totalExpense = transactions
              .filter((tx) => tx.type === 'expense')
              .reduce((sum, tx) => sum + tx.amount, 0)
            const totalIncome = transactions
              .filter((tx) => tx.type === 'income')
              .reduce((sum, tx) => sum + tx.amount, 0)
            const balance = totalIncome - totalExpense

            return (
              <>
                <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded">
                  <span className="text-slate-700 dark:text-slate-300">Total de Despesas</span>
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    -R$ {totalExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded">
                  <span className="text-slate-700 dark:text-slate-300">Total de Receitas</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    R$ {totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
                  <span className="text-slate-700 dark:text-slate-300">Saldo</span>
                  <span
                    className={`font-semibold ${
                      balance >= 0
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

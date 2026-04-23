'use client'

import React from 'react'
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

/**
 * CategoryBreakdownChart — Recharts PieChart that renders a user's expenses
 * per category for a month. Percentages come pre-computed from the backend
 * (last slice absorbs rounding drift, so legend totals 100.0%).
 *
 * When ``items`` is empty, an empty-state panel is shown instead of an empty
 * chart canvas. The visual style mirrors the transaction-list empty state
 * from the main dashboard (@po recommendation #1).
 */

export interface CategoryBreakdownChartItem {
  category_id: string | null
  category_name: string
  total: number
  percentage: number
}

export interface CategoryBreakdownChartProps {
  items: CategoryBreakdownChartItem[]
  totalExpenses: number
  loading?: boolean
}

const COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
]

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function CategoryBreakdownChart({
  items,
  totalExpenses,
  loading = false,
}: CategoryBreakdownChartProps) {
  if (loading) {
    return (
      <div
        className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6"
        data-testid="breakdown-loading"
      >
        <div className="h-80 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </div>
    )
  }

  if (!items || items.length === 0) {
    return (
      <div
        className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6"
        data-testid="breakdown-empty"
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Despesas por categoria
        </h3>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-8 text-center text-blue-700 dark:text-blue-300">
          <p className="font-medium">
            Nenhuma despesa registrada neste mês.
          </p>
          <p className="text-sm mt-2 text-slate-600 dark:text-slate-400">
            Adicione uma transação do tipo &quot;despesa&quot; para ver o detalhamento por categoria.
          </p>
        </div>
      </div>
    )
  }

  const chartData = items.map((item) => ({
    name: item.category_name,
    value: item.total,
    percentage: item.percentage,
  }))

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6"
      data-testid="breakdown-chart"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Despesas por categoria
        </h3>
        <span
          className="text-sm text-slate-500 dark:text-slate-400"
          data-testid="breakdown-total"
        >
          Total: R$ {formatBRL(totalExpenses)}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={(props: any) =>
              `${props?.name ?? ''}: ${props?.payload?.percentage ?? props?.percentage ?? 0}%`
            }
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
            nameKey="name"
          >
            {chartData.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={((value: any, _name: any, entry: any) => [
              `R$ ${formatBRL(Number(value))} (${entry?.payload?.percentage ?? 0}%)`,
              entry?.payload?.name ?? 'Categoria',
            ]) as any}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => (
              <span className="text-slate-700 dark:text-slate-300 text-sm">
                {value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Accessible fallback / text summary — also consumed by E2E tests. */}
      <ul
        className="mt-4 space-y-1 text-sm"
        data-testid="breakdown-legend-list"
      >
        {items.map((item, idx) => (
          <li
            key={item.category_id ?? `uncat-${idx}`}
            className="flex items-center justify-between text-slate-700 dark:text-slate-300"
          >
            <span className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                aria-hidden
              />
              {item.category_name}
            </span>
            <span className="font-medium">
              R$ {formatBRL(item.total)} · {item.percentage}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

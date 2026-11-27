'use client'

import React, { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useAppearance } from '@/app/_theme/provider'

export interface CategoryBreakdownChartItem {
  category_id: string | null
  category_name: string
  total: number
  percentage: number
}

export interface CategoryBreakdownChartProps {
  items: CategoryBreakdownChartItem[]
  totalExpenses: number
  categories?: Array<{ name: string; color: string; icon?: string }>
  loading?: boolean
}

function formatBRL(value: number): string {
  return (Number(value) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function CategoryBreakdownChart({
  items,
  totalExpenses,
  categories = [],
  loading = false,
}: CategoryBreakdownChartProps) {
  const { chartPalette } = useAppearance()

  const catMetaByName = useMemo(() => {
    const map: Record<string, { color: string; icon?: string }> = {}
    for (const c of categories) {
      map[c.name.toLowerCase()] = { color: c.color, icon: c.icon }
    }
    return map
  }, [categories])

  if (loading) {
    return (
      <div className="glass-card p-6" data-testid="breakdown-loading">
        <div className="h-80 bg-white/40 dark:bg-white/5 rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (!items || items.length === 0) {
    return (
      <div className="glass-card p-6" data-testid="breakdown-empty">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
          Despesas por categoria
        </h3>
        <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-8 text-center text-blue-700 dark:text-blue-300">
          <p className="font-semibold">Nenhuma despesa registrada neste mês.</p>
          <p className="text-sm mt-2 text-slate-600 dark:text-slate-400">
            Adicione uma transação do tipo &quot;despesa&quot; para ver o detalhamento por categoria.
          </p>
        </div>
      </div>
    )
  }

  const chartData = items.map((item, idx) => {
    const meta = catMetaByName[item.category_name.toLowerCase()]
    return {
      name: item.category_name,
      value: Number(item.total) || 0,
      percentage: Number(item.percentage) || 0,
      color: meta?.color || chartPalette[idx % chartPalette.length],
      icon: meta?.icon || '🏷️',
    }
  })

  return (
    <div className="glass-card p-6" data-testid="breakdown-chart">
      <div className="flex items-center justify-between gap-2 mb-5">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Despesas por categoria
        </h3>
        <span
          className="text-sm font-semibold text-slate-600 dark:text-slate-300 tabular-nums money-value"
          data-testid="breakdown-total"
        >
          Total: R$ {formatBRL(totalExpenses)}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-5 relative h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, idx) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={entry.color}
                    stroke="rgba(255,255,255,0.65)"
                    strokeWidth={1.5}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `R$ ${formatBRL(Number(value || 0))}`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Despesas
            </span>
            <span className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums money-value">
              R$ {formatBRL(totalExpenses)}
            </span>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-2 max-h-[290px] overflow-y-auto pr-1">
          {chartData.map((cat) => (
            <div
              key={cat.name}
              className="px-3 py-2 rounded-xl bg-white/45 dark:bg-white/5 border border-white/50 dark:border-white/10"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span aria-hidden="true">{cat.icon}</span>
                  <span className="truncate">{cat.name}</span>
                </span>
                <span className="font-bold tabular-nums whitespace-nowrap text-slate-900 dark:text-white money-value">
                  R$ {formatBRL(cat.value)}{' '}
                  <span className="text-slate-500 dark:text-slate-400 font-medium">
                    ({cat.percentage.toFixed(1).replace('.', ',')}%)
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, cat.percentage)}%`, backgroundColor: cat.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

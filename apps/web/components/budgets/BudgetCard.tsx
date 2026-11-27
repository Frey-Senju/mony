'use client'

import React from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Budget } from '@/hooks/useBudgets'

interface BudgetCardProps {
  budget: Budget
  categoryColor?: string
  categoryIcon?: string
  onEdit: (budget: Budget) => void
  onDelete: (id: string) => void
}

const PROGRESS_COLORS = {
  ok: {
    bar: 'bg-gradient-to-r from-emerald-500 to-teal-400',
    text: 'text-emerald-700 dark:text-emerald-300',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
    border: 'border-emerald-500/25',
  },
  warning: {
    bar: 'bg-gradient-to-r from-amber-500 to-orange-400',
    text: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
    border: 'border-amber-500/35',
  },
  exceeded: {
    bar: 'bg-gradient-to-r from-rose-500 to-red-500',
    text: 'text-rose-700 dark:text-rose-300',
    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
    border: 'border-rose-500/40',
  },
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getDaysRemainingInMonth(): number {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Math.max(1, lastDay - now.getDate() + 1)
}

export function BudgetCard({
  budget,
  categoryColor,
  categoryIcon,
  onEdit,
  onDelete,
}: BudgetCardProps) {
  const color = PROGRESS_COLORS[budget.alert_level]
  const pct = Math.min(Number(budget.percentage) || 0, 100)
  const spent = Number(budget.spent_amount) || 0
  const limit = Number(budget.limit_amount) || 0
  const remaining = limit - spent
  const daysLeft = getDaysRemainingInMonth()
  const dailySafe = remaining > 0 ? remaining / daysLeft : 0

  return (
    <div className={`glass-card p-5 border ${color.border} transition-all hover:shadow-lg`}>
      <div className="flex items-start justify-between gap-2 mb-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 border"
            style={
              categoryColor
                ? {
                    backgroundColor: `${categoryColor}20`,
                    borderColor: `${categoryColor}45`,
                  }
                : undefined
            }
            aria-hidden="true"
          >
            {categoryIcon || '🏷️'}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 dark:text-white truncate">{budget.category}</p>
            <span
              className={`inline-flex items-center px-2 py-0.5 mt-0.5 rounded-full text-[11px] font-semibold border ${color.badge}`}
            >
              {budget.alert_level === 'exceeded'
                ? 'Limite ultrapassado'
                : budget.alert_level === 'warning'
                  ? 'Próximo do limite'
                  : 'Dentro do limite'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(budget)}
            className="p-1.5 rounded-xl hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
            aria-label="Editar budget"
          >
            <Pencil className="w-4 h-4 text-slate-500 dark:text-slate-300" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(budget.id)}
            className="p-1.5 rounded-xl hover:bg-rose-500/15 transition-colors"
            aria-label="Excluir budget"
          >
            <Trash2 className="w-4 h-4 text-rose-500" />
          </button>
        </div>
      </div>

      <div className="w-full bg-slate-200/75 dark:bg-white/10 rounded-full h-2.5 mb-3 overflow-hidden">
        <div
          className={`${color.bar} h-full rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between items-baseline text-sm gap-2">
        <span className="text-slate-700 dark:text-slate-300 font-medium tabular-nums money-value">
          {formatBRL(spent)} gastos
        </span>
        <span className={`font-bold tabular-nums money-value ${color.text}`}>
          {Number(budget.percentage).toFixed(1)}% de {formatBRL(limit)}
        </span>
      </div>

      {/* Daily safe allowance indicator */}
      <div className="mt-2.5 pt-2.5 border-t border-white/40 dark:border-white/10 flex items-center justify-between text-[11px]">
        {remaining >= 0 ? (
          <>
            <span className="text-slate-500 dark:text-slate-400">
              Restam <strong className="text-slate-700 dark:text-slate-200 money-value">{formatBRL(remaining)}</strong> ({daysLeft}d no mês)
            </span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums money-value">
              {formatBRL(dailySafe)}/dia
            </span>
          </>
        ) : (
          <span className="text-rose-600 dark:text-rose-400 font-semibold money-value">
            Excedido em {formatBRL(Math.abs(remaining))} neste mês
          </span>
        )}
      </div>
    </div>
  )
}

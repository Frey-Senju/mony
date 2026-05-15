'use client'

import React from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Budget } from '@/hooks/useBudgets'

interface BudgetCardProps {
  budget: Budget
  onEdit: (budget: Budget) => void
  onDelete: (id: string) => void
}

const PROGRESS_COLORS = {
  ok: {
    bar: 'bg-green-500',
    text: 'text-green-700 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  },
  warning: {
    bar: 'bg-yellow-500',
    text: 'text-yellow-700 dark:text-yellow-400',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  },
  exceeded: {
    bar: 'bg-red-500',
    text: 'text-red-700 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  },
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function BudgetCard({ budget, onEdit, onDelete }: BudgetCardProps) {
  const color = PROGRESS_COLORS[budget.alert_level]
  const pct = Math.min(Number(budget.percentage), 100)

  return (
    <div className={`border rounded-lg p-4 ${color.bg}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">{budget.category}</p>
          <p className={`text-xs mt-0.5 ${color.text}`}>
            {budget.alert_level === 'exceeded' ? 'Limite ultrapassado' :
             budget.alert_level === 'warning' ? 'Próximo do limite' : 'Dentro do limite'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(budget)}
            className="p-1.5 rounded hover:bg-black/10 transition-colors"
            aria-label="Editar budget"
          >
            <Pencil className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={() => onDelete(budget.id)}
            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            aria-label="Excluir budget"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>

      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-2">
        <div
          className={`${color.bar} h-2 rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-400">
          {formatBRL(Number(budget.spent_amount))} gastos
        </span>
        <span className={`font-medium ${color.text}`}>
          {Number(budget.percentage).toFixed(1)}% de {formatBRL(Number(budget.limit_amount))}
        </span>
      </div>
    </div>
  )
}

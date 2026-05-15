'use client'

import React from 'react'
import { Pencil, Trash2, PlusCircle, Trophy } from 'lucide-react'
import type { Goal } from '@/hooks/useGoals'

interface GoalCardProps {
  goal: Goal
  onEdit: (goal: Goal) => void
  onDeposit: (goal: Goal) => void
  onDelete: (id: string) => void
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function GoalCard({ goal, onEdit, onDeposit, onDelete }: GoalCardProps) {
  const pct = Math.min(Number(goal.progress_pct), 100)
  const isAchieved = goal.is_achieved

  return (
    <div className={`border rounded-lg p-4 ${
      isAchieved
        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 mr-2">
          <div className="flex items-center gap-1.5">
            {isAchieved && <Trophy className="w-4 h-4 text-green-500 flex-shrink-0" />}
            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{goal.name}</p>
          </div>
          {goal.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{goal.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isAchieved && (
            <button
              onClick={() => onDeposit(goal)}
              className="p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              aria-label="Depositar"
            >
              <PlusCircle className="w-4 h-4 text-blue-500" />
            </button>
          )}
          <button
            onClick={() => onEdit(goal)}
            className="p-1.5 rounded hover:bg-black/10 transition-colors"
            aria-label="Editar meta"
          >
            <Pencil className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={() => onDelete(goal.id)}
            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            aria-label="Excluir meta"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>

      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-2">
        <div
          className={`h-2 rounded-full transition-all ${isAchieved ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-400">
          {formatBRL(Number(goal.current_amount))} acumulados
        </span>
        <span className={`font-medium ${isAchieved ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>
          {Number(goal.progress_pct).toFixed(1)}% de {formatBRL(Number(goal.target_amount))}
        </span>
      </div>

      {!isAchieved && goal.target_date && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
          Prazo: {new Date(goal.target_date + 'T00:00:00').toLocaleDateString('pt-BR')}
        </p>
      )}
      {isAchieved && (
        <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 font-medium">
          Meta atingida!
        </p>
      )}
    </div>
  )
}

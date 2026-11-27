'use client'

import React from 'react'
import { Pencil, Trash2, PlusCircle, Trophy, Calendar } from 'lucide-react'
import type { Goal } from '@/hooks/useGoals'

interface GoalCardProps {
  goal: Goal
  onEdit: (goal: Goal) => void
  onDeposit: (goal: Goal) => void
  onDelete: (id: string) => void
}

function formatBRL(value: number): string {
  return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function computeMonthlyNeeded(remaining: number, targetDate?: string | null): { monthsLeft: number; perMonth: number } | null {
  if (!targetDate || remaining <= 0) return null
  const target = new Date(`${targetDate.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(target.getTime())) return null
  const now = new Date()
  const monthsDiff =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
  const monthsLeft = Math.max(1, monthsDiff)
  return { monthsLeft, perMonth: remaining / monthsLeft }
}

export function GoalCard({ goal, onEdit, onDeposit, onDelete }: GoalCardProps) {
  const pct = Math.min(Number(goal.progress_pct) || 0, 100)
  const current = Number(goal.current_amount) || 0
  const target = Number(goal.target_amount) || 0
  const remaining = Math.max(0, target - current)
  const isAchieved = goal.is_achieved
  const monthlyPlan = !isAchieved ? computeMonthlyNeeded(remaining, goal.target_date) : null

  return (
    <div
      className={`glass-card p-5 border transition-all hover:shadow-lg ${
        isAchieved
          ? 'border-emerald-500/35 bg-emerald-500/5'
          : 'border-white/50 dark:border-white/15'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isAchieved && (
              <span className="w-7 h-7 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4" aria-hidden="true" />
              </span>
            )}
            <p className="font-bold text-slate-900 dark:text-white truncate">{goal.name}</p>
          </div>
          {goal.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {goal.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isAchieved && (
            <button
              type="button"
              onClick={() => onDeposit(goal)}
              className="liquid-btn liquid-btn-glass px-2.5 py-1.5 rounded-xl text-xs font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1"
              aria-label="Depositar"
            >
              <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Aportar</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(goal)}
            className="p-1.5 rounded-xl hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
            aria-label="Editar meta"
          >
            <Pencil className="w-4 h-4 text-slate-500 dark:text-slate-300" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(goal.id)}
            className="p-1.5 rounded-xl hover:bg-rose-500/15 transition-colors"
            aria-label="Excluir meta"
          >
            <Trash2 className="w-4 h-4 text-rose-500" />
          </button>
        </div>
      </div>

      <div className="w-full bg-slate-200/75 dark:bg-white/10 rounded-full h-2.5 mb-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isAchieved
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
              : 'bg-gradient-to-r from-blue-600 to-indigo-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between items-baseline text-sm gap-2">
        <span className="text-slate-700 dark:text-slate-300 font-medium tabular-nums money-value">
          {formatBRL(current)} acumulados
        </span>
        <span
          className={`font-bold tabular-nums money-value ${
            isAchieved
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-blue-600 dark:text-blue-400'
          }`}
        >
          {Number(goal.progress_pct).toFixed(1)}% de {formatBRL(target)}
        </span>
      </div>

      <div className="mt-3 pt-2.5 border-t border-white/40 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
        {isAchieved ? (
          <p className="text-emerald-600 dark:text-emerald-400 font-bold">
            Meta atingida!
          </p>
        ) : (
          <>
            <span className="text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
              {goal.target_date ? (
                <>
                  <Calendar className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
                  Prazo: {new Date(`${goal.target_date.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')}
                </>
              ) : (
                <>Faltam <strong className="text-slate-700 dark:text-slate-200 money-value">{formatBRL(remaining)}</strong></>
              )}
            </span>
            {monthlyPlan ? (
              <span className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums money-value">
                {monthlyPlan.monthsLeft}m · {formatBRL(monthlyPlan.perMonth)}/mês
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Sem prazo definido
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

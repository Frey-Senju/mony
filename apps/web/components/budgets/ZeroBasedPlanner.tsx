'use client'

import React, { useMemo, useState } from 'react'
import { Scale, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { Budget } from '@/hooks/useBudgets'

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

const ESSENTIAL_REGEX = /casa|moradia|aluguel|mercado|supermercado|alimenta|sa[uú]de|transporte|carro|gasolina|educa|conta|luz|agua|internet/i

export function ZeroBasedPlanner({
  budgets,
  avgMonthlyIncome,
}: {
  budgets: Budget[]
  avgMonthlyIncome: number
}) {
  const [plannedIncome, setPlannedIncome] = useState<string>(() =>
    avgMonthlyIncome > 0 ? String(Math.round(avgMonthlyIncome)) : '6000'
  )
  const [investGoal, setInvestGoal] = useState<string>(() =>
    avgMonthlyIncome > 0 ? String(Math.round(avgMonthlyIncome * 0.2)) : '1200'
  )

  const incomeNum = Math.max(0, Number(plannedIncome.replace(',', '.')) || 0)
  const investNum = Math.max(0, Number(investGoal.replace(',', '.')) || 0)

  const analysis = useMemo(() => {
    let essentialBudget = 0
    let lifestyleBudget = 0
    let totalSpent = 0
    const paceAlerts: Array<{ category: string; projected: number; limit: number }> = []

    const now = new Date()
    const daysElapsed = Math.max(1, now.getDate())
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()

    for (const b of budgets) {
      const lim = Number(b.limit_amount) || 0
      const spent = Number(b.spent_amount) || 0
      totalSpent += spent
      if (ESSENTIAL_REGEX.test(b.category)) {
        essentialBudget += lim
      } else {
        lifestyleBudget += lim
      }
      const projected = (spent / daysElapsed) * daysInMonth
      if (lim > 0 && spent < lim && projected > lim * 1.05 && daysElapsed >= 4) {
        paceAlerts.push({ category: b.category, projected, limit: lim })
      }
    }

    const totalAllocated = essentialBudget + lifestyleBudget + investNum
    const unallocated = incomeNum - totalAllocated

    const essPct = incomeNum > 0 ? Math.min(100, (essentialBudget / incomeNum) * 100) : 0
    const lifePct = incomeNum > 0 ? Math.min(100, (lifestyleBudget / incomeNum) * 100) : 0
    const invPct = incomeNum > 0 ? Math.min(100, (investNum / incomeNum) * 100) : 0

    return {
      essentialBudget,
      lifestyleBudget,
      totalAllocated,
      unallocated,
      totalSpent,
      essPct,
      lifePct,
      invPct,
      paceAlerts,
    }
  }, [budgets, incomeNum, investNum])

  const balanced = Math.abs(analysis.unallocated) < 1

  return (
    <section className="glass-panel p-5 space-y-4 border border-blue-400/25">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-blue-500" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Planejador Base Zero &amp; Regra 60 / 30 / 10 Viva
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Dê um destino para cada real da sua renda prevista e acompanhe o equilíbrio entre Essenciais, Estilo de Vida e Aportes
            </p>
          </div>
        </div>

        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border money-value ${
            balanced
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
              : analysis.unallocated > 0
                ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
          }`}
        >
          {balanced ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              R$ 0,00 sem destino · Equilibrado!
            </>
          ) : analysis.unallocated > 0 ? (
            <>Falta alocar: {brl(analysis.unallocated)}</>
          ) : (
            <>⚠ Alocado {brl(Math.abs(analysis.unallocated))} acima da renda</>
          )}
        </div>
      </div>

      {/* Editable Income & Invest Target */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="glass-card p-3 block">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Renda Prevista do Mês (R$)
          </span>
          <input
            type="number"
            min="0"
            step="50"
            value={plannedIncome}
            onChange={(e) => setPlannedIncome(e.target.value)}
            className="input-base mt-1 py-1 text-sm font-bold"
          />
        </label>
        <label className="glass-card p-3 block">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Meta de Aportes &amp; Metas (R$)
          </span>
          <input
            type="number"
            min="0"
            step="50"
            value={investGoal}
            onChange={(e) => setInvestGoal(e.target.value)}
            className="input-base mt-1 py-1 text-sm font-bold text-emerald-600 dark:text-emerald-400"
          />
        </label>
        <div className="glass-card p-3">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Essenciais (meta ≤ 60%)
          </span>
          <p className="text-base font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums money-value">
            {brl(analysis.essentialBudget)}{' '}
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              ({analysis.essPct.toFixed(0)}%)
            </span>
          </p>
        </div>
        <div className="glass-card p-3">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Estilo de Vida (meta ≤ 30%)
          </span>
          <p className="text-base font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums money-value">
            {brl(analysis.lifestyleBudget)}{' '}
            <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
              ({analysis.lifePct.toFixed(0)}%)
            </span>
          </p>
        </div>
      </div>

      {/* 60/30/10 Visual Allocation Bar */}
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded-full bg-slate-200/75 dark:bg-white/10 overflow-hidden flex gap-0.5">
          <div
            title={`Essenciais: ${analysis.essPct.toFixed(1)}%`}
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${Math.min(100, analysis.essPct)}%` }}
          />
          <div
            title={`Estilo de Vida: ${analysis.lifePct.toFixed(1)}%`}
            className="h-full bg-violet-500 transition-all duration-500"
            style={{ width: `${Math.min(100 - analysis.essPct, analysis.lifePct)}%` }}
          />
          <div
            title={`Investimentos & Metas: ${analysis.invPct.toFixed(1)}%`}
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(100 - analysis.essPct - analysis.lifePct, analysis.invPct))}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Essenciais ({analysis.essPct.toFixed(0)}%)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-500" /> Estilo de Vida ({analysis.lifePct.toFixed(0)}%)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Aportes &amp; Metas ({analysis.invPct.toFixed(0)}%)
          </span>
        </div>
      </div>

      {/* Proactive Pace Overflow Alerts */}
      {analysis.paceAlerts.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 space-y-1">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            Alerta de Ritmo (projeção até o fim do mês):
          </p>
          <ul className="text-[11px] text-amber-900 dark:text-amber-200 space-y-0.5">
            {analysis.paceAlerts.slice(0, 3).map((pa) => (
              <li key={pa.category}>
                • <strong>{pa.category}</strong>: no ritmo atual fechará em{' '}
                <strong className="money-value">{brl(pa.projected)}</strong> (limite:{' '}
                <span className="money-value">{brl(pa.limit)}</span>)
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

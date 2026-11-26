'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, Sparkles, X, ArrowRight } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const DISMISS_KEY = 'mony_checklist_dismissed_v1'

interface ChecklistProps {
  token?: string
  budgetsCount: number
}

export function SetupChecklist({ token, budgetsCount }: ChecklistProps) {
  const [dismissed, setDismissed] = useState(true)
  const [stats, setStats] = useState<{
    openFinanceConnected: boolean
    aiReviewClean: boolean
    hasGoals: boolean
    healthScore: number | null
  } | null>(null)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === 'true')
    } catch {
      setDismissed(false)
    }
  }, [])

  useEffect(() => {
    if (!token || dismissed) return
    const headers = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch(`${API_URL}/accounts/audit`, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${API_URL}/ai/suggestions?status=pending`, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${API_URL}/insights/health-score`, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([audit, sugs, hs]) => {
      setStats({
        openFinanceConnected: Number(audit?.open_finance_linked_accounts ?? 0) > 0,
        aiReviewClean: Number(sugs?.total_pending ?? 0) === 0,
        hasGoals: Number(hs?.pillars?.find((p: { id: string; score: number }) => p.id === 'organization')?.score ?? 0) >= 10,
        healthScore: typeof hs?.score === 'number' ? hs.score : null,
      })
    })
  }, [token, dismissed])

  if (!token || dismissed || !stats) return null

  const items = [
    {
      label: 'Conectar banco via Open Finance',
      done: stats.openFinanceConnected,
      href: '/settings/connections',
    },
    {
      label: 'Zerar pendências na Revisão IA',
      done: stats.aiReviewClean,
      href: '/dashboard/ai-review',
    },
    {
      label: 'Definir Budgets Proativos',
      done: budgetsCount > 0,
      href: '/dashboard/budgets',
    },
    {
      label: 'Cadastrar 1ª Meta ou Investimento',
      done: stats.hasGoals,
      href: '/dashboard/goals',
    },
  ]

  const doneCount = items.filter((i) => i.done).length
  const pct = Math.round((doneCount / items.length) * 100)
  if (pct === 100) return null

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      // ignore
    }
  }

  return (
    <section
      className="glass-card p-4 border-blue-400/35 space-y-3 no-print"
      aria-label="Checklist de configuração financeira Mony"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-violet-500 shrink-0" aria-hidden="true" />
          <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
            Saúde do Setup Mony: {pct}% concluído
            {stats.healthScore !== null ? ` · Health Score ${stats.healthScore}/100` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Ocultar checklist"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
        <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs transition ${
              item.done
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'bg-white/50 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200'
            }`}
          >
            <span className="flex items-center gap-1.5 truncate">
              {item.done ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="w-3.5 h-3.5 shrink-0 opacity-50" aria-hidden="true" />
              )}
              <span className="truncate font-medium">{item.label}</span>
            </span>
            {!item.done && <ArrowRight className="w-3 h-3 shrink-0 opacity-60" aria-hidden="true" />}
          </Link>
        ))}
      </div>
    </section>
  )
}

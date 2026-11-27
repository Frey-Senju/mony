'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, Sparkles, X, ArrowRight } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const DISMISS_KEY = 'mony_onboarding_checklist_dismissed_v1'

interface HealthCheck {
  id: string
  label: string
  ok: boolean
  detail: string
  href: string | null
}

interface HealthPayload {
  accounts_count: number
  checks: HealthCheck[]
}

export function OnboardingChecklist({ token }: { token?: string }) {
  const [dismissed, setDismissed] = useState(true)
  const [data, setData] = useState<HealthPayload | null>(null)

  useEffect(() => {
    try {
      const wasDismissed = localStorage.getItem(DISMISS_KEY) === 'true'
      setDismissed(wasDismissed)
    } catch {
      setDismissed(false)
    }
  }, [])

  useEffect(() => {
    if (!token || dismissed) return
    let active = true
    fetch(`${API_URL}/insights/account-health`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setData(d)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [token, dismissed])

  if (dismissed || !data || !data.checks?.length) return null

  const items = [
    {
      id: 'accounts',
      label: 'Criar ou conectar sua primeira conta',
      ok: data.accounts_count > 0,
      href: '/dashboard/accounts',
    },
    ...data.checks.map((c) => ({
      id: c.id,
      label: c.label,
      ok: c.ok,
      href: c.href || '/settings/profile',
    })),
  ]

  const doneCount = items.filter((i) => i.ok).length
  if (doneCount === items.length) return null

  const pct = Math.round((doneCount / items.length) * 100)

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
      className="no-print glass-panel p-4 sm:p-5 border border-blue-400/30 bg-gradient-to-r from-blue-500/8 via-transparent to-emerald-500/8 space-y-3"
      aria-label="Primeiros passos no Mony"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Configure seu Mony ao máximo ({doneCount}/{items.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Conclua os passos pendentes para desbloquear alertas, projeções e segurança total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 w-28">
            <div className="flex-1 h-2 rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: 'var(--accent)' }}
              />
            </div>
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
              {pct}%
            </span>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Ocultar checklist"
            title="Ocultar checklist"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`glass-card px-3 py-2.5 flex items-center justify-between gap-2 text-xs transition hover:scale-[1.01] ${
              item.ok ? 'opacity-65' : 'border-blue-400/35'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              {item.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-slate-400 shrink-0" />
              )}
              <span
                className={`truncate font-medium ${
                  item.ok
                    ? 'line-through text-slate-500 dark:text-slate-400'
                    : 'text-slate-800 dark:text-slate-100'
                }`}
              >
                {item.label}
              </span>
            </span>
            {!item.ok && <ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
          </Link>
        ))}
      </div>
    </section>
  )
}

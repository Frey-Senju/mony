'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Check, X, RefreshCw, ArrowRight, CheckCheck } from 'lucide-react'
import { useAuth } from '@/stores/auth/useAuth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface AISuggestionItem {
  id: string
  suggestion_type: string
  module: string
  target_entity_type?: string | null
  target_entity_id?: string | null
  title: string
  reason: string
  current_snapshot?: Record<string, unknown> | null
  proposed_patch: Record<string, unknown>
  confidence: number
  status: string
}

interface AISuggestionsBannerProps {
  module?: string
  title?: string
  maxItems?: number
  onApplied?: () => void
}

const TYPE_LABELS: Record<string, string> = {
  self_transfer: 'Transferência Mesmo Titular',
  invoice_month: 'Mês da Fatura',
  tx_divergence: 'Divergência / Categoria',
  card_inconsistency: 'Auditoria Cartão',
  budget_recommendation: 'Sugestão Budget',
  account_audit: 'Auditoria Conta',
  category_missing: 'Categoria Sugerida',
}

export function AISuggestionsBanner({
  module,
  title = 'Revisão Proativa da Mony IA',
  maxItems = 3,
  onApplied,
}: AISuggestionsBannerProps) {
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const [items, setItems] = useState<AISuggestionItem[]>([])
  const [running, setRunning] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    const qs = new URLSearchParams({ status: 'pending' })
    if (module && module !== 'all') qs.set('module', module)
    const res = await fetch(`${API_URL}/ai/suggestions?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null)
    if (res && res.ok) {
      const data = await res.json()
      setItems(data.items || [])
    }
  }, [token, module])

  useEffect(() => {
    load()
  }, [load])

  const runAudit = async () => {
    if (!token) return
    setRunning(true)
    try {
      await fetch(`${API_URL}/ai/review/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      await load()
    } finally {
      setRunning(false)
    }
  }

  const handleAction = async (id: string, action: 'apply' | 'dismiss') => {
    if (!token) return
    setBusyId(id)
    try {
      const res = await fetch(`${API_URL}/ai/suggestions/${id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setItems((prev) => prev.filter((s) => s.id !== id))
        if (action === 'apply') {
          onApplied?.()
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('mony:transactions-updated'))
          }
        }
      }
    } finally {
      setBusyId(null)
    }
  }

  const handleBulkApply = async () => {
    if (!token) return
    setBulkBusy(true)
    try {
      const res = await fetch(`${API_URL}/ai/suggestions/apply-bulk`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          min_confidence: 0.85,
          module: module && module !== 'all' ? module : undefined,
        }),
      })
      if (res.ok) {
        await load()
        onApplied?.()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('mony:transactions-updated'))
        }
      }
    } finally {
      setBulkBusy(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="glass-card p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <strong>{title}:</strong> Nenhuma pendência encontrada nesta área.
        </span>
        <button
          type="button"
          onClick={runAudit}
          disabled={running}
          className="liquid-btn liquid-btn-glass px-3 py-1.5 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Auditando...' : 'Rodar Auditoria IA'}
        </button>
      </div>
    )
  }

  const visible = items.slice(0, maxItems)

  return (
    <section className="glass-panel p-4 border border-[var(--accent)]/35 bg-[var(--accent-soft)]/20 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
            {title} ({items.length} sugestão{items.length > 1 ? 'ões' : ''})
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleBulkApply}
            disabled={bulkBusy}
            className="liquid-btn liquid-btn-primary px-3 py-1.5 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            {bulkBusy ? 'Aplicando...' : 'Aplicar Alta Confiança'}
          </button>
          <button
            type="button"
            onClick={runAudit}
            disabled={running}
            className="liquid-btn liquid-btn-glass px-2.5 py-1.5 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${running ? 'animate-spin' : ''}`} />
            Reavaliar
          </button>
          <Link
            href="/dashboard/ai-review"
            className="text-[11px] font-semibold text-[var(--accent)] inline-flex items-center gap-1 hover:underline"
          >
            Ver todas <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        {visible.map((sug) => (
          <div
            key={sug.id}
            className="glass-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent)]">
                  {TYPE_LABELS[sug.suggestion_type] || sug.suggestion_type}
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  {Math.round(sug.confidence * 100)}% confiança
                </span>
              </div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">{sug.title}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                {sug.reason}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={busyId === sug.id}
                onClick={() => handleAction(sug.id, 'apply')}
                className="liquid-btn liquid-btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                Aplicar
              </button>
              <button
                type="button"
                disabled={busyId === sug.id}
                onClick={() => handleAction(sug.id, 'dismiss')}
                className="liquid-btn liquid-btn-glass p-1.5 rounded-xl text-slate-500"
                title="Dispensar sugestão"
                aria-label="Dispensar sugestão"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

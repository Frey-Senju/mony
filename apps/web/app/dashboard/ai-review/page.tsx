'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  Sparkles,
  Check,
  X,
  RefreshCw,
  CheckCheck,
  ShieldCheck,
  Filter,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { useAuth } from '@/stores/auth/useAuth'
import type { AISuggestionItem } from '@/components/ai/AISuggestionsBanner'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const MODULES = [
  { id: 'all', label: 'Todas' },
  { id: 'transactions', label: 'Transações & Faturas' },
  { id: 'cards', label: 'Cartões' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'accounts', label: 'Contas' },
  { id: 'categories', label: 'Categorias' },
]

const TYPE_LABELS: Record<string, string> = {
  self_transfer: 'Transferência Mesmo Titular',
  invoice_month: 'Mês da Fatura',
  tx_divergence: 'Divergência / Categoria',
  card_inconsistency: 'Auditoria Cartão',
  budget_recommendation: 'Budget IA',
  account_audit: 'Auditoria Conta',
  category_missing: 'Nova Categoria',
}

export default function AIReviewPage() {
  return (
    <PrivateRoute>
      <AIReviewContent />
    </PrivateRoute>
  )
}

function AIReviewContent() {
  const { tokens } = useAuth()
  const token = tokens?.access_token || ''

  const [items, setItems] = useState<AISuggestionItem[]>([])
  const [countsByMod, setCountsByMod] = useState<Record<string, number>>({})
  const [totalPending, setTotalPending] = useState(0)
  const [moduleFilter, setModuleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'applied' | 'dismissed'>('pending')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({ status: statusFilter })
      if (moduleFilter !== 'all') qs.set('module', moduleFilter)
      const res = await fetch(`${API_URL}/ai/suggestions?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setCountsByMod(data.counts_by_module || {})
        setTotalPending(data.total_pending || 0)
      }
    } finally {
      setLoading(false)
    }
  }, [token, moduleFilter, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  const runFullAudit = async () => {
    if (!token) return
    setRunning(true)
    setBanner(null)
    try {
      const res = await fetch(`${API_URL}/ai/review/run?lookback_days=180`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setBanner(
          `Auditoria concluída (${data.reviewed_transactions} lançamentos revisados): ${data.created} nova(s) sugestão(ões) encontrada(s).`
        )
        await load()
      }
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
        setBanner(action === 'apply' ? 'Sugestão aplicada com sucesso!' : 'Sugestão dispensada.')
        await load()
        if (action === 'apply' && typeof window !== 'undefined') {
          window.dispatchEvent(new Event('mony:transactions-updated'))
        }
      }
    } finally {
      setBusyId(null)
    }
  }

  const handleBulkApply = async () => {
    if (!token) return
    setRunning(true)
    try {
      const res = await fetch(`${API_URL}/ai/suggestions/apply-bulk`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          min_confidence: 0.85,
          module: moduleFilter !== 'all' ? moduleFilter : undefined,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setBanner(`${data.applied} sugestão(ões) de alta confiança aplicada(s) automaticamente!`)
        await load()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('mony:transactions-updated'))
        }
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="glass-panel flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <Sparkles className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Central de Revisão Proativa · Mony IA
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Auditoria automática de transações, competência de faturas, transferências entre suas contas, cartões, budgets e categorias.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={runFullAudit}
            disabled={running}
            className="liquid-btn liquid-btn-glass px-4 py-2.5 rounded-2xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Auditando...' : 'Executar Auditoria Completa'}
          </button>
          {totalPending > 0 && statusFilter === 'pending' && (
            <button
              type="button"
              onClick={handleBulkApply}
              disabled={running}
              className="liquid-btn liquid-btn-primary px-4 py-2.5 rounded-2xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" />
              Aplicar Todas (≥ 85%)
            </button>
          )}
        </div>
      </header>

      {banner && (
        <div className="glass-card p-3.5 border-emerald-400/50 text-sm text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner(null)} aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <section className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
          {MODULES.map((m) => {
            const count = m.id === 'all' ? totalPending : countsByMod[m.id] || 0
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModuleFilter(m.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                  moduleFilter === m.id
                    ? 'liquid-btn-primary border-transparent'
                    : 'bg-white/45 dark:bg-white/5 border-white/60 dark:border-white/10 text-slate-700 dark:text-slate-300'
                }`}
              >
                {m.label} {count > 0 && statusFilter === 'pending' ? `(${count})` : ''}
              </button>
            )
          })}
        </div>

        <div className="inline-flex p-1 rounded-xl bg-white/45 dark:bg-white/10 border border-white/50 dark:border-white/15">
          {(
            [
              ['pending', 'Pendentes'],
              ['applied', 'Aplicadas'],
              ['dismissed', 'Dispensadas'],
            ] as const
          ).map(([st, label]) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                statusFilter === st ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Suggestions List */}
      <section className="space-y-3">
        {loading ? (
          <div className="glass-card p-8 text-sm text-slate-500">Carregando sugestões da Mony IA...</div>
        ) : items.length === 0 ? (
          <div className="glass-panel p-10 text-center space-y-2">
            <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Tudo revisado e consistente!
            </h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Não há sugestões {statusFilter === 'pending' ? 'pendentes' : statusFilter === 'applied' ? 'aplicadas' : 'dispensadas'} neste filtro. Clique em <strong>Executar Auditoria Completa</strong> sempre que importar novas contas ou transações.
            </p>
          </div>
        ) : (
          items.map((sug) => (
            <article
              key={sug.id}
              className="glass-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent)]">
                    {TYPE_LABELS[sug.suggestion_type] || sug.suggestion_type}
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {Math.round(sug.confidence * 100)}% confiança
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{sug.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {sug.reason}
                </p>
              </div>

              {statusFilter === 'pending' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyId === sug.id}
                    onClick={() => handleAction(sug.id, 'apply')}
                    className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Aplicar Alteração
                  </button>
                  <button
                    type="button"
                    disabled={busyId === sug.id}
                    onClick={() => handleAction(sug.id, 'dismiss')}
                    className="liquid-btn liquid-btn-glass px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300"
                  >
                    Dispensar
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  )
}

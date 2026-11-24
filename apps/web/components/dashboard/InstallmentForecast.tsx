'use client'

import React, { useEffect, useState } from 'react'
import { CreditCard, Calendar, Sparkles, ChevronRight } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ProjectedItem {
  description: string
  merchant_name?: string | null
  amount: number
  installment_number: number
  installment_total: number
  status: 'recorded' | 'projected'
  payment_method: string
  original_purchase_date?: string | null
}

interface MonthProjection {
  month: string
  label: string
  recorded_total: number
  projected_total: number
  total_committed: number
  installments_count: number
  items: ProjectedItem[]
}

interface ProjectionPayload {
  base_month: string
  total_future_committed: number
  active_chains_count: number
  months: MonthProjection[]
}

export interface InstallmentForecastProps {
  token?: string
  startMonth: string
  refreshKey?: number
  onSelectMonth?: (ym: string) => void
}

function formatBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function InstallmentForecast({
  token,
  startMonth,
  refreshKey = 0,
  onSelectMonth,
}: InstallmentForecastProps) {
  const [data, setData] = useState<ProjectionPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [focusedMonth, setFocusedMonth] = useState<string>(startMonth)

  useEffect(() => {
    setFocusedMonth(startMonth)
  }, [startMonth])

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    fetch(
      `${API_URL}/transactions/installments/projection?start_month=${encodeURIComponent(startMonth)}&months=6`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: ProjectionPayload | null) => {
        if (!active) return
        setData(payload)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token, startMonth, refreshKey])

  if (loading && !data) {
    return <div className="glass-card h-36 animate-pulse" aria-busy="true" />
  }

  if (!data || data.active_chains_count === 0) {
    return (
      <div className="glass-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-sm"
            style={{ background: 'var(--accent)' }}
            aria-hidden="true"
          >
            <CreditCard className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Projeção de Parcelas Futuras (6 meses)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Quando você importar uma fatura de cartão com compras parceladas pela Mony IA, as próximas parcelas aparecem projetadas automaticamente aqui.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              const btn = document.querySelector<HTMLButtonElement>('[data-testid="open-ai-import"]')
              btn?.click()
            }
          }}
          className="liquid-btn liquid-btn-glass inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          Importar Fatura
        </button>
      </div>
    )
  }

  const maxTotal = Math.max(...data.months.map((m) => m.total_committed), 1)
  const activeMonthData =
    data.months.find((m) => m.month === focusedMonth) || data.months[0]

  return (
    <div className="glass-card p-5 space-y-4" data-testid="installment-forecast">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className="w-9 h-9 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-sm"
            style={{ background: 'var(--accent)' }}
            aria-hidden="true"
          >
            <CreditCard className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Projeção de Parcelas ({data.months.length} meses)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {data.active_chains_count} compra(s) parcelada(s) ativa(s) · clique em um mês para detalhar
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
            Comprometido no período
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {formatBRL(data.total_future_committed)}
          </p>
        </div>
      </div>

      {/* 6-Month Visual Bar Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {data.months.map((m) => {
          const isSelected = m.month === activeMonthData?.month
          const pct = Math.max(8, Math.round((m.total_committed / maxTotal) * 100))
          return (
            <button
              key={m.month}
              type="button"
              onClick={() => setFocusedMonth(m.month)}
              className={`text-left p-3 rounded-2xl border transition-all ${
                isSelected
                  ? 'liquid-nav-active border-white/80 dark:border-white/25 scale-[1.01]'
                  : 'bg-white/45 dark:bg-white/5 border-white/60 dark:border-white/10 hover:bg-white/65 dark:hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
                <span>{m.label}</span>
                <span className="text-[10px] opacity-70">{m.installments_count}x</span>
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-1.5">
                {formatBRL(m.total_committed)}
              </p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: m.total_committed > 0 ? `${pct}%` : '0%',
                    background:
                      m.recorded_total > 0 && m.projected_total === 0
                        ? 'var(--accent)'
                        : 'linear-gradient(90deg, var(--accent), #a855f7)',
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                {m.projected_total > 0
                  ? m.recorded_total > 0
                    ? 'Fatura + Previsto'
                    : 'Previsto'
                  : m.recorded_total > 0
                  ? 'Na fatura'
                  : 'Livre'}
              </p>
            </button>
          )
        })}
      </div>

      {/* Selected Month Breakdown */}
      {activeMonthData && (
        <div className="pt-2 border-t border-white/40 dark:border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              Detalhe de {activeMonthData.label} ({activeMonthData.items.length} parcela(s))
            </p>
            {onSelectMonth && (
              <button
                type="button"
                onClick={() => onSelectMonth(activeMonthData.month)}
                className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                Ver fatura completa
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {activeMonthData.items.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-1">
              Nenhuma parcela prevista para {activeMonthData.label}.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeMonthData.items.map((item, idx) => (
                <div
                  key={`${item.description}-${item.installment_number}-${idx}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/45 dark:bg-white/5 border border-white/50 dark:border-white/10"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {item.merchant_name || item.description}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100/80 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                        Parcela {item.installment_number}/{item.installment_total}
                      </span>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          item.status === 'recorded'
                            ? 'bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-100/80 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {item.status === 'recorded' ? 'Lançada' : 'Projetada'}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white shrink-0">
                    {formatBRL(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Sparkles,
  Store,
  CalendarDays,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Trophy,
  Flame,
  TrendingDown,
  TrendingUp,
  Printer,
} from 'lucide-react'
import type { Category } from '@/hooks/useCategories'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface MerchantTx {
  id: string
  date: string
  description: string
  amount: number
  category_name: string
}

interface MerchantRow {
  name: string
  count: number
  total: number
  avg_ticket: number
  share_pct: number
  category_name: string
  items: MerchantTx[]
}

interface WeekdayPoint {
  day_index: number
  label: string
  total: number
  count: number
  avg: number
  pct_of_max: number
}

interface ComparisonRow {
  category: string
  amount_a: number
  amount_b: number
  delta: number
  delta_pct: number
}

interface XRayPayload {
  month: string
  compare_month: string
  review: {
    total_income: number
    total_expenses: number
    net: number
    savings_rate_pct: number
    tx_count: number
    expenses_count: number
    daily_avg_spend: number
    days_elapsed: number
    days_in_month: number
    is_current_month: boolean
    projected_month_end_spend: number
    projected_net: number
    biggest_expense: {
      id: string
      description: string
      amount: number
      date: string
      category_name: string
    } | null
    top_merchants: MerchantRow[]
    biggest_saving_category: ComparisonRow | null
    biggest_increase_category: ComparisonRow | null
    headline: string
  }
  merchants: MerchantRow[]
  weekday_heatmap: WeekdayPoint[]
  weekday_insight: string
  month_thirds: Array<{ label: string; total: number; count: number; share_pct: number }>
  comparison: {
    month_a: string
    month_b: string
    income_a: number
    income_b: number
    expenses_a: number
    expenses_b: number
    net_a: number
    net_b: number
    categories: ComparisonRow[]
  }
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

function getCurrentYm(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function prevYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export function SpendingXRayAndReview({
  token,
  categories = [],
}: {
  token?: string
  categories?: Category[]
}) {
  const [monthA, setMonthA] = useState(getCurrentYm)
  const [monthB, setMonthB] = useState(() => prevYm(getCurrentYm()))
  const [data, setData] = useState<XRayPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null)

  const catMetaByName = useMemo(() => {
    const m: Record<string, { color: string; icon?: string }> = {}
    for (const c of categories) m[c.name.toLowerCase()] = { color: c.color, icon: c.icon }
    return m
  }, [categories])

  const fetchXRay = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(
        `${API_URL}/insights/xray?month=${encodeURIComponent(monthA)}&compare_month=${encodeURIComponent(monthB)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [token, monthA, monthB])

  useEffect(() => {
    fetchXRay()
  }, [fetchXRay])

  const r = data?.review
  const comp = data?.comparison

  return (
    <div className="space-y-6">
      {/* Selector Header */}
      <div className="glass-panel p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #0071E3 100%)' }}
          >
            <Sparkles className="w-5 h-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Mony Review &amp; Raio-X de Gastos
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Fechamento cinematográfico, ranking de estabelecimentos, mapa de calor semanal e comparador mês a mês
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>Mês A:</span>
            <input
              type="month"
              value={monthA}
              onChange={(e) => {
                setMonthA(e.target.value)
                setMonthB(prevYm(e.target.value))
              }}
              className="input-base py-1 px-2 text-xs w-auto"
            />
          </label>
          <span className="text-xs text-slate-400 font-bold">vs</span>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>Mês B:</span>
            <input
              type="month"
              value={monthB}
              onChange={(e) => setMonthB(e.target.value)}
              className="input-base py-1 px-2 text-xs w-auto"
            />
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            className="liquid-btn liquid-btn-glass px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            PDF
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 glass-card animate-pulse" />
          ))}
        </div>
      ) : data && r && comp ? (
        <>
          {/* Mony Review Wrapped Hero Card */}
          <section className="glass-panel p-6 border border-indigo-400/35 bg-gradient-to-br from-indigo-500/10 via-blue-500/5 to-emerald-500/10 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                  ✨ Fechamento · {data.month}
                </span>
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mt-2">
                  {r.headline}
                </h3>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                  Taxa de Economia
                </p>
                <p
                  className={`text-3xl font-black tabular-nums ${
                    r.savings_rate_pct >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {r.savings_rate_pct.toFixed(1).replace('.', ',')}%
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Top 3 Merchants Podium */}
              <div className="glass-card p-4 space-y-2">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                  Top 3 Estabelecimentos
                </p>
                {r.top_merchants.length === 0 ? (
                  <p className="text-xs text-slate-500">Sem despesas no mês.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {r.top_merchants.map((m, i) => (
                      <li key={m.name} className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                          {['🥇', '🥈', '🥉'][i]} {m.name}
                        </span>
                        <span className="font-bold tabular-nums money-value shrink-0 text-slate-900 dark:text-white">
                          {brl(m.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Biggest Single Expense */}
              <div className="glass-card p-4 space-y-1.5">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-rose-500" aria-hidden="true" />
                  Maior Compra Única
                </p>
                {r.biggest_expense ? (
                  <>
                    <p className="text-lg font-extrabold text-rose-600 dark:text-rose-400 tabular-nums money-value">
                      {brl(r.biggest_expense.amount)}
                    </p>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {r.biggest_expense.description}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {r.biggest_expense.category_name} · {r.biggest_expense.date.slice(8, 10)}/{r.biggest_expense.date.slice(5, 7)}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">Sem lançamentos.</p>
                )}
              </div>

              {/* Daily Pace & Month-End Projection */}
              <div className="glass-card p-4 space-y-1.5">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Ritmo Diário de Gastos
                </p>
                <p className="text-lg font-extrabold text-blue-600 dark:text-blue-400 tabular-nums money-value">
                  {brl(r.daily_avg_spend)}/dia
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  {r.is_current_month
                    ? `Projeção fim do mês: ${brl(r.projected_month_end_spend)}`
                    : `${r.expenses_count} despesas em ${r.days_in_month} dias`}
                </p>
              </div>

              {/* Biggest Economy vs Compared Month */}
              <div className="glass-card p-4 space-y-1.5">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                  Campeã de Economia
                </p>
                {r.biggest_saving_category ? (
                  <>
                    <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums money-value">
                      {brl(Math.abs(r.biggest_saving_category.delta))}
                    </p>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {r.biggest_saving_category.category}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {r.biggest_saving_category.delta_pct.toFixed(1)}% vs {data.compare_month}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">Sem redução em relação a {data.compare_month}.</p>
                )}
              </div>
            </div>
          </section>

          {/* Weekday Heatmap + Month Thirds */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-7 glass-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-500" aria-hidden="true" />
                  Mapa de Calor por Dia da Semana
                </h3>
                <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                  {data.weekday_insight}
                </span>
              </div>
              <div className="grid grid-cols-7 gap-2 items-end h-36 pt-4">
                {data.weekday_heatmap.map((wd) => (
                  <div key={wd.day_index} className="flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300 money-value">
                      {wd.total > 0 ? `R$${Math.round(wd.total)}` : '—'}
                    </span>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        title={`${wd.label}: ${brl(wd.total)} (${wd.count} compras)`}
                        className="w-full rounded-t-xl transition-all duration-500"
                        style={{
                          height: `${Math.max(8, wd.pct_of_max)}%`,
                          background:
                            wd.pct_of_max >= 85
                              ? 'linear-gradient(180deg, #f43f5e, #fb7185)'
                              : 'linear-gradient(180deg, #0071E3, #60a5fa)',
                          opacity: wd.total > 0 ? 0.9 : 0.2,
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      {wd.label}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="lg:col-span-5 glass-card p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Concentração por Faixa do Mês
              </h3>
              <div className="space-y-3">
                {data.month_thirds.map((th) => (
                  <div key={th.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {th.label} <span className="text-slate-400 font-normal">({th.count} compras)</span>
                      </span>
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white money-value">
                        {brl(th.total)}{' '}
                        <span className="text-slate-500 font-medium">({th.share_pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, th.share_pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Merchant Ranking (Expandable Drilldown) */}
          <section className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Store className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                Ranking de Estabelecimentos · {data.month} ({data.merchants.length})
              </h3>
              <span className="text-[11px] text-slate-500">Clique em um local para ver cada compra</span>
            </div>

            {data.merchants.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                Nenhuma despesa encontrada em {data.month}.
              </p>
            ) : (
              <div className="space-y-2">
                {data.merchants.slice(0, 12).map((m) => {
                  const open = expandedMerchant === m.name
                  const catMeta = catMetaByName[m.category_name.toLowerCase()]
                  return (
                    <div
                      key={m.name}
                      className="rounded-xl border border-white/50 dark:border-white/10 bg-white/45 dark:bg-white/5 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedMerchant(open ? null : m.name)}
                        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-white/50 dark:hover:bg-white/5 transition"
                      >
                        <div className="min-w-0 flex items-center gap-2.5">
                          <span
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                            style={{
                              backgroundColor: `${catMeta?.color || '#0071E3'}20`,
                              border: `1px solid ${catMeta?.color || '#0071E3'}45`,
                            }}
                          >
                            {catMeta?.icon || '🏷️'}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {m.name}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {m.count} compra{m.count > 1 ? 's' : ''} · Ticket médio{' '}
                              <span className="money-value">{brl(m.avg_ticket)}</span> · {m.share_pct}% do mês
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-extrabold tabular-nums text-rose-600 dark:text-rose-400 money-value">
                            {brl(m.total)}
                          </span>
                          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </button>

                      {open && (
                        <div className="px-4 py-2.5 border-t border-white/40 dark:border-white/10 bg-white/30 dark:bg-black/15 space-y-1.5">
                          {m.items.map((it) => (
                            <div key={it.id} className="flex items-center justify-between text-xs">
                              <span className="text-slate-600 dark:text-slate-300 truncate">
                                <span className="font-mono text-[11px] text-slate-400 mr-2">
                                  {it.date.slice(8, 10)}/{it.date.slice(5, 7)}
                                </span>
                                {it.description}
                              </span>
                              <span className="font-semibold tabular-nums text-slate-900 dark:text-white money-value">
                                {brl(it.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Month A vs Month B Side-by-Side Category Comparator */}
          <section className="glass-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-violet-500" aria-hidden="true" />
                Comparador {comp.month_a} × {comp.month_b}
              </h3>
              <div className="flex items-center gap-3 text-xs tabular-nums">
                <span className="text-slate-600 dark:text-slate-300">
                  Despesas {comp.month_a}: <strong className="money-value">{brl(comp.expenses_a)}</strong>
                </span>
                <span className="text-slate-400">vs</span>
                <span className="text-slate-600 dark:text-slate-300">
                  {comp.month_b}: <strong className="money-value">{brl(comp.expenses_b)}</strong>
                </span>
              </div>
            </div>

            {comp.categories.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                Sem categorias para comparar entre estes dois meses.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/40 dark:border-white/10 text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="py-2 text-left">Categoria</th>
                      <th className="py-2 text-right">{comp.month_b}</th>
                      <th className="py-2 text-right">{comp.month_a}</th>
                      <th className="py-2 text-right">Variação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/25 dark:divide-white/5">
                    {comp.categories.map((row) => {
                      const meta = catMetaByName[row.category.toLowerCase()]
                      const saved = row.delta < 0
                      return (
                        <tr key={row.category} className="hover:bg-white/35 dark:hover:bg-white/5">
                          <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-100">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: meta?.color || '#64748b' }}
                              />
                              <span aria-hidden="true">{meta?.icon || '🏷️'}</span>
                              <span>{row.category}</span>
                            </span>
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400 money-value">
                            {brl(row.amount_b)}
                          </td>
                          <td className="py-2.5 text-right tabular-nums font-bold text-slate-900 dark:text-white money-value">
                            {brl(row.amount_a)}
                          </td>
                          <td className="py-2.5 text-right tabular-nums font-bold">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${
                                saved
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : row.delta > 0
                                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                    : 'bg-slate-200/60 dark:bg-white/10 text-slate-500'
                              }`}
                            >
                              {saved ? (
                                <TrendingDown className="w-3 h-3" aria-hidden="true" />
                              ) : row.delta > 0 ? (
                                <TrendingUp className="w-3 h-3" aria-hidden="true" />
                              ) : null}
                              <span className="money-value">
                                {row.delta > 0 ? '+' : ''}
                                {brl(row.delta)}
                              </span>
                              <span className="opacity-80">
                                ({row.delta > 0 ? '+' : ''}
                                {row.delta_pct.toFixed(0)}%)
                              </span>
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

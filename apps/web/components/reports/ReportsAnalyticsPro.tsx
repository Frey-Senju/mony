'use client'

import React, { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  AreaChart,
  Area,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import {
  Sparkles,
  Table2,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Store,
  CreditCard,
  Layers,
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Okabe-Ito WCAG AA Colorblind-Safe Palette
const ACCESSIBLE_PALETTE = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00']

interface MonthlyCashflowPoint {
  ym: string
  label: string
  income: number
  expenses: number
  net: number
}

interface PaymentMethodItem {
  method: string
  label: string
  total: number
  count: number
}

interface AccountSpendItem {
  account: string
  total: number
}

interface WeekdayHeatItem {
  day_index: number
  label: string
  total: number
  count: number
}

interface MerchantItem {
  merchant: string
  total: number
  count: number
}

interface CategoryDeltaItem {
  category: string
  current: number
  previous: number
  avg_3m: number
  delta_value: number
  delta_pct: number
}

interface AnalyticsPayload {
  period: string
  monthly_cashflow_12m: MonthlyCashflowPoint[]
  top_categories_6m: string[]
  category_evolution_6m: Array<Record<string, string | number>>
  by_payment_method: PaymentMethodItem[]
  by_account: AccountSpendItem[]
  weekday_heatmap: WeekdayHeatItem[]
  top_merchants: MerchantItem[]
  category_delta_mom: CategoryDeltaItem[]
  savings_rate_pct: number
  ai_executive_summary: string
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function compactBrl(v: number): string {
  if (Math.abs(v) >= 1000) {
    return `R$ ${(v / 1000).toFixed(1)}k`
  }
  return `R$ ${v.toFixed(0)}`
}

interface ReportsAnalyticsProProps {
  token?: string
  year: number
  month: number
}

export function ReportsAnalyticsPro({ token, year, month }: ReportsAnalyticsProProps) {
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [tableViews, setTableViews] = useState<Record<string, boolean>>({})

  const toggleView = (key: string) => {
    setTableViews((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    fetch(`${API_URL}/reports/analytics?year=${year}&month=${month}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res && res.ok ? res.json() : null))
      .then((json: AnalyticsPayload | null) => {
        if (!cancelled && json && Array.isArray(json.monthly_cashflow_12m)) {
          setData(json)
        }
      })
      .catch(() => {
        // Silently degrade if analytics endpoint is unavailable
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, year, month])

  if (!token) return null

  if (loading && !data) {
    return (
      <section className="space-y-4" aria-label="Carregando análises avançadas">
        <div className="glass-card h-24 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card h-80 animate-pulse" />
          <div className="glass-card h-80 animate-pulse" />
        </div>
      </section>
    )
  }

  if (!data) return null

  const maxWeekday = Math.max(1, ...data.weekday_heatmap.map((d) => d.total))
  const maxMerchant = Math.max(1, ...data.top_merchants.map((m) => m.total))

  return (
    <div className="space-y-6" data-testid="reports-analytics-pro">
      {/* 0. AI Executive Summary */}
      <section
        className="glass-panel border-violet-400/35 dark:border-violet-500/30"
        aria-label="Resumo executivo da Mony IA"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className="w-10 h-10 rounded-2xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm"
              aria-hidden="true"
            >
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Resumo Executivo — Mony IA
              </h2>
              <p className="text-sm text-slate-700 dark:text-slate-200 mt-1 leading-relaxed">
                {data.ai_executive_summary}
              </p>
            </div>
          </div>
          <div className="shrink-0 glass-card px-4 py-2.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Taxa de Poupança
            </p>
            <p
              className={`text-xl font-bold mt-0.5 ${
                data.savings_rate_pct >= 20
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : data.savings_rate_pct >= 0
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {data.savings_rate_pct.toFixed(1)}%
            </p>
          </div>
        </div>
      </section>

      {/* 1. Fluxo de Caixa 12 Meses */}
      <section className="glass-card p-5 space-y-4" aria-label="Fluxo de caixa dos últimos 12 meses">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#0072B2]" aria-hidden="true" />
              Fluxo de Caixa — Últimos 12 Meses
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Comparativo acessível de receitas, despesas e saldo líquido mensal
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleView('cashflow12m')}
            aria-pressed={!!tableViews.cashflow12m}
            className="liquid-btn liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
          >
            {tableViews.cashflow12m ? (
              <>
                <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                Ver Gráfico
              </>
            ) : (
              <>
                <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
                Ver Tabela
              </>
            )}
          </button>
        </div>

        {tableViews.cashflow12m ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200/70 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-4">Mês</th>
                  <th className="py-2 px-3 text-right">Receitas</th>
                  <th className="py-2 px-3 text-right">Despesas</th>
                  <th className="py-2 pl-3 text-right">Saldo Líquido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                {data.monthly_cashflow_12m.map((row) => (
                  <tr key={row.ym}>
                    <td className="py-2 pr-4 font-medium text-slate-900 dark:text-white">{row.label}</td>
                    <td className="py-2 px-3 text-right text-emerald-700 dark:text-emerald-400">{brl(row.income)}</td>
                    <td className="py-2 px-3 text-right text-rose-700 dark:text-rose-400">{brl(row.expenses)}</td>
                    <td className="py-2 pl-3 text-right font-semibold text-slate-900 dark:text-white">{brl(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.monthly_cashflow_12m} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={compactBrl} tick={{ fontSize: 11 }} width={68} />
                <Tooltip formatter={(v) => brl(Number(v ?? 0))} />
                <Legend />
                <Bar dataKey="income" name="Receitas" fill="#009E73" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" name="Despesas" fill="#D55E00" radius={[6, 6, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Saldo Líquido"
                  stroke="#0072B2"
                  strokeWidth={2.5}
                  dot={{ r: 3.5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Row: 2. Category Evolution 6m + 3. Payment Method & Accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 2. Evolução por Categoria (6 Meses) */}
        <section className="glass-card p-5 space-y-4" aria-label="Evolução de gastos por categoria nos últimos 6 meses">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#CC79A7]" aria-hidden="true" />
                Evolução por Categoria (6 Meses)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Principais categorias de despesa com paleta acessível
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleView('cat6m')}
              aria-pressed={!!tableViews.cat6m}
              className="liquid-btn liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
            >
              {tableViews.cat6m ? (
                <>
                  <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                  Gráfico
                </>
              ) : (
                <>
                  <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Tabela
                </>
              )}
            </button>
          </div>

          {data.top_categories_6m.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              Sem despesas categorizadas nos últimos 6 meses.
            </p>
          ) : tableViews.cat6m ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200/70 dark:border-white/10 text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3">Mês</th>
                    {data.top_categories_6m.map((c) => (
                      <th key={c} className="py-2 px-2 text-right">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                  {data.category_evolution_6m.map((row) => (
                    <tr key={String(row.ym)}>
                      <td className="py-2 pr-3 font-medium text-slate-900 dark:text-white">{String(row.label)}</td>
                      {data.top_categories_6m.map((c) => (
                        <td key={c} className="py-2 px-2 text-right text-slate-700 dark:text-slate-200">
                          {brl(Number(row[c] ?? 0))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.category_evolution_6m} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={compactBrl} tick={{ fontSize: 11 }} width={64} />
                  <Tooltip formatter={(v) => brl(Number(v ?? 0))} />
                  <Legend />
                  {data.top_categories_6m.map((cat, idx) => (
                    <Area
                      key={cat}
                      type="monotone"
                      dataKey={cat}
                      stackId="1"
                      stroke={ACCESSIBLE_PALETTE[idx % ACCESSIBLE_PALETTE.length]}
                      fill={ACCESSIBLE_PALETTE[idx % ACCESSIBLE_PALETTE.length]}
                      fillOpacity={0.35}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* 3. Gastos por Forma de Pagamento & Conta */}
        <section className="glass-card p-5 space-y-4" aria-label="Gastos por forma de pagamento e por conta">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#009E73]" aria-hidden="true" />
                Meios de Pagamento & Contas
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Distribuição das despesas no mês selecionado
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleView('pm')}
              aria-pressed={!!tableViews.pm}
              className="liquid-btn liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
            >
              {tableViews.pm ? (
                <>
                  <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                  Gráfico
                </>
              ) : (
                <>
                  <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Tabela
                </>
              )}
            </button>
          </div>

          {data.by_payment_method.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              Nenhuma despesa registrada neste mês.
            </p>
          ) : tableViews.pm ? (
            <div className="space-y-4">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-200/70 dark:border-white/10 text-xs text-slate-500">
                    <th className="py-1.5">Meio de Pagamento</th>
                    <th className="py-1.5 text-right">Qtd.</th>
                    <th className="py-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                  {data.by_payment_method.map((pm) => (
                    <tr key={pm.method}>
                      <td className="py-2 font-medium text-slate-900 dark:text-white">{pm.label}</td>
                      <td className="py-2 text-right text-slate-600 dark:text-slate-300">{pm.count}</td>
                      <td className="py-2 text-right font-semibold text-slate-900 dark:text-white">{brl(pm.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.by_account.length > 0 && (
                <div className="pt-2 border-t border-slate-200/60 dark:border-white/10">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Por Conta</p>
                  <div className="space-y-1.5">
                    {data.by_account.map((a) => (
                      <div key={a.account} className="flex justify-between text-xs">
                        <span className="text-slate-700 dark:text-slate-200">{a.account}</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{brl(a.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.by_payment_method}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 10, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis type="number" tickFormatter={compactBrl} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" width={115} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => brl(Number(v ?? 0))} />
                    <Bar dataKey="total" name="Total" fill="#0072B2" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {data.by_account.length > 0 && (
                <div className="pt-2 border-t border-slate-200/60 dark:border-white/10 flex flex-wrap gap-2">
                  {data.by_account.map((a) => (
                    <span
                      key={a.account}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/80 dark:bg-white/10 text-xs text-slate-700 dark:text-slate-200"
                    >
                      <span className="font-medium">{a.account}:</span>
                      <span className="font-bold">{brl(a.total)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Row: 4. Weekday Heatmap + 5. Top 10 Merchants */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 4. Mapa de Calor por Dia da Semana */}
        <section className="glass-card p-5 space-y-4" aria-label="Mapa de calor de gastos por dia da semana">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#E69F00]" aria-hidden="true" />
                Gastos por Dia da Semana
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Identifique em quais dias da semana seu consumo concentra mais
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleView('weekday')}
              aria-pressed={!!tableViews.weekday}
              className="liquid-btn liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
            >
              {tableViews.weekday ? (
                <>
                  <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                  Mapa
                </>
              ) : (
                <>
                  <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Tabela
                </>
              )}
            </button>
          </div>

          {tableViews.weekday ? (
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200/70 dark:border-white/10 text-xs text-slate-500">
                  <th className="py-1.5">Dia</th>
                  <th className="py-1.5 text-right">Transações</th>
                  <th className="py-1.5 text-right">Total Gasto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                {data.weekday_heatmap.map((d) => (
                  <tr key={d.day_index}>
                    <td className="py-2 font-medium text-slate-900 dark:text-white">{d.label}</td>
                    <td className="py-2 text-right text-slate-600 dark:text-slate-300">{d.count}</td>
                    <td className="py-2 text-right font-semibold text-slate-900 dark:text-white">{brl(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-7 gap-2 pt-2">
              {data.weekday_heatmap.map((d) => {
                const intensity = d.total > 0 ? Math.max(0.18, d.total / maxWeekday) : 0.05
                return (
                  <div
                    key={d.day_index}
                    className="rounded-xl p-2.5 text-center border border-slate-200/70 dark:border-white/10 flex flex-col justify-between min-h-[104px]"
                    style={{
                      backgroundColor: `rgba(0, 114, 178, ${intensity * 0.45})`,
                    }}
                    aria-label={`${d.label}: ${brl(d.total)} em ${d.count} transações`}
                  >
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{d.label}</span>
                    <div className="my-1">
                      <p className="text-[11px] font-bold text-slate-900 dark:text-white leading-tight">
                        {compactBrl(d.total)}
                      </p>
                      <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5">
                        {d.count}x
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* 5. Top 10 Estabelecimentos */}
        <section className="glass-card p-5 space-y-4" aria-label="Top 10 estabelecimentos por valor gasto">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Store className="w-4 h-4 text-[#D55E00]" aria-hidden="true" />
                Top 10 Estabelecimentos
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Onde você mais concentrou despesas no mês
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleView('merchants')}
              aria-pressed={!!tableViews.merchants}
              className="liquid-btn liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
            >
              {tableViews.merchants ? (
                <>
                  <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                  Barras
                </>
              ) : (
                <>
                  <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Tabela
                </>
              )}
            </button>
          </div>

          {data.top_merchants.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              Nenhum estabelecimento registrado neste mês.
            </p>
          ) : tableViews.merchants ? (
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200/70 dark:border-white/10 text-xs text-slate-500">
                  <th className="py-1.5">Estabelecimento</th>
                  <th className="py-1.5 text-right">Compras</th>
                  <th className="py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                {data.top_merchants.map((m) => (
                  <tr key={m.merchant}>
                    <td className="py-1.5 font-medium text-slate-900 dark:text-white">{m.merchant}</td>
                    <td className="py-1.5 text-right text-slate-600 dark:text-slate-300">{m.count}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-900 dark:text-white">{brl(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="space-y-2.5">
              {data.top_merchants.map((m, idx) => {
                const pct = Math.min(100, Math.round((m.total / maxMerchant) * 100))
                return (
                  <div key={m.merchant} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-100 truncate">
                        {idx + 1}. {m.merchant}{' '}
                        <span className="text-slate-400">({m.count}x)</span>
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white shrink-0">
                        {brl(m.total)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: ACCESSIBLE_PALETTE[idx % ACCESSIBLE_PALETTE.length],
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* 6. Comparativo Mês Atual vs Anterior & Média 3m */}
      <section
        className="glass-card p-5 space-y-4"
        aria-label="Comparativo mensal por categoria contra mês anterior e média trimestral"
      >
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Comparativo Mensal por Categoria (Mês Atual vs Anterior &amp; Média 3m)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Variação em reais e percentual com ícones de tendência para leitura acessível
          </p>
        </div>

        {data.category_delta_mom.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
            Sem dados comparativos para o período selecionado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200/70 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-4">Categoria</th>
                  <th className="py-2 px-3 text-right">Mês Atual</th>
                  <th className="py-2 px-3 text-right">Mês Anterior</th>
                  <th className="py-2 px-3 text-right">Média 3m</th>
                  <th className="py-2 pl-3 text-right">Variação (MoM)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                {data.category_delta_mom.map((row) => {
                  const up = row.delta_value > 0
                  const down = row.delta_value < 0
                  return (
                    <tr key={row.category}>
                      <td className="py-2.5 pr-4 font-semibold text-slate-900 dark:text-white">
                        {row.category}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-900 dark:text-white">
                        {brl(row.current)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-300">
                        {brl(row.previous)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-300">
                        {brl(row.avg_3m)}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <span
                          className={`inline-flex items-center justify-end gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                            up
                              ? 'bg-rose-100/80 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                              : down
                              ? 'bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {up ? (
                            <TrendingUp className="w-3 h-3" aria-hidden="true" />
                          ) : down ? (
                            <TrendingDown className="w-3 h-3" aria-hidden="true" />
                          ) : (
                            <Minus className="w-3 h-3" aria-hidden="true" />
                          )}
                          {up ? '+' : ''}
                          {brl(row.delta_value)} ({up ? '+' : ''}
                          {row.delta_pct.toFixed(1)}%)
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
    </div>
  )
}

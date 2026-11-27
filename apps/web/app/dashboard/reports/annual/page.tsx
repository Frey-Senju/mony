'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  Wallet,
  Trophy,
  ArrowUpRight,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { useAuth } from '@/stores/auth/useAuth'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const MONTH_LABELS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTH_LABELS_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

interface AnnualMonthItem {
  month: number
  income: number
  expenses: number
  net: number
}

interface AnnualSummary {
  year: number
  months: AnnualMonthItem[]
  totals: AnnualMonthItem
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function fmtBRL(n: number): string {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function AnnualReportsPage() {
  return (
    <PrivateRoute>
      <AnnualContent />
    </PrivateRoute>
  )
}

function AnnualContent() {
  const auth = useAuth()
  const token = auth.tokens?.access_token

  const now = useMemo(() => new Date(), [])
  const [year, setYear] = useState(now.getFullYear())
  const [data, setData] = useState<AnnualSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportingXlsx, setExportingXlsx] = useState(false)

  const fetchAnnual = useCallback(
    async (y: number) => {
      if (!token) return
      setLoading(true)
      setError(null)
      try {
        const r = await fetch(`${API_URL}/reports/annual-summary?year=${y}`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        })
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        const raw = await r.json()
        setData({
          year: raw.year,
          months: raw.months.map((m: Record<string, unknown>) => ({
            month: Number(m.month),
            income: toNumber(m.income),
            expenses: toNumber(m.expenses),
            net: toNumber(m.net),
          })),
          totals: {
            month: 0,
            income: toNumber(raw.totals?.income),
            expenses: toNumber(raw.totals?.expenses),
            net: toNumber(raw.totals?.net),
          },
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao buscar resumo anual')
      } finally {
        setLoading(false)
      }
    },
    [token]
  )

  useEffect(() => {
    fetchAnnual(year)
  }, [token, year, fetchAnnual])

  useEffect(() => {
    document.title = `Mony · Relatório Anual ${year}`
  }, [year])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return
      }
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setYear((y) => y - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setYear((y) => y + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const enrichedMonths = useMemo(() => {
    let cumulative = 0
    return (data?.months ?? []).map((m) => {
      cumulative += m.net
      const savingsPct = m.income > 0 ? Math.round((m.net / m.income) * 100) : 0
      return {
        ...m,
        ym: `${year}-${String(m.month).padStart(2, '0')}`,
        label: `${MONTH_LABELS_SHORT[m.month - 1]}/${String(year).slice(2)}`,
        fullLabel: MONTH_LABELS_FULL[m.month - 1],
        cumulative,
        savingsPct,
      }
    })
  }, [data, year])

  const chartData = enrichedMonths.map((m) => ({
    label: m.label,
    Receitas: m.income,
    Despesas: m.expenses,
    'Saldo Acumulado': m.cumulative,
  }))

  const activeMonths = enrichedMonths.filter((m) => m.income > 0 || m.expenses > 0)
  const bestMonth = activeMonths.length > 0 ? activeMonths.reduce((a, b) => (b.net > a.net ? b : a)) : null
  const worstMonth = activeMonths.length > 0 ? activeMonths.reduce((a, b) => (b.net < a.net ? b : a)) : null
  const annualSavingsRate =
    data && data.totals.income > 0 ? ((data.totals.net / data.totals.income) * 100).toFixed(1).replace('.', ',') : '0,0'

  const handleExportCSV = () => {
    if (enrichedMonths.length === 0) return
    const headers = ['Mês', 'Receitas (R$)', 'Despesas (R$)', 'Saldo do Mês (R$)', 'Saldo Acumulado (R$)', 'Economia (%)']
    const rows = enrichedMonths.map((m) => [
      `${m.fullLabel}/${year}`,
      m.income.toFixed(2).replace('.', ','),
      m.expenses.toFixed(2).replace('.', ','),
      m.net.toFixed(2).replace('.', ','),
      m.cumulative.toFixed(2).replace('.', ','),
      `${m.savingsPct}%`,
    ])
    const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(';')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mony-resumo-anual-${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
    dispatchToast(`Resumo anual ${year} exportado em CSV!`, 'success')
  }

  const handleExportXlsx = async () => {
    if (!token) return
    setExportingXlsx(true)
    try {
      const res = await fetch(`${API_URL}/reports/export-xlsx?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Falha ao gerar Excel')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mony-relatorio-${year}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      dispatchToast(`Excel ${year} (.xlsx) baixado!`, 'success')
    } catch {
      dispatchToast('Não foi possível exportar Excel agora.', 'error')
    } finally {
      setExportingXlsx(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Liquid Glass */}
      <header className="glass-panel flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ background: 'var(--accent)' }}
            aria-hidden="true"
          >
            <BarChart3 className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Relatório Anual · {year}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              Visão consolidada dos 12 meses, saldo acumulado e evolução anual
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 no-print">
          <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-white/55 dark:bg-white/10 border border-white/70 dark:border-white/15">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              aria-label="Ano anterior"
              title="Ano anterior (Alt + ←)"
              className="p-1.5 rounded-xl hover:bg-white/70 dark:hover:bg-white/15 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
              {year}
            </span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              aria-label="Próximo ano"
              title="Próximo ano (Alt + →)"
              className="p-1.5 rounded-xl hover:bg-white/70 dark:hover:bg-white/15 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className="liquid-btn liquid-btn-glass px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            CSV
          </button>
          <button
            type="button"
            onClick={handleExportXlsx}
            disabled={exportingXlsx}
            className="liquid-btn liquid-btn-glass px-3 py-2 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            {exportingXlsx ? 'Gerando...' : 'Excel (.xlsx)'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="liquid-btn liquid-btn-glass px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            PDF
          </button>
          <Link
            href="/dashboard/reports"
            className="liquid-btn liquid-btn-glass px-3 py-2 rounded-xl text-xs font-semibold text-blue-600 dark:text-blue-400"
          >
            ← Mensal
          </Link>
        </div>
      </header>

      {error && (
        <div role="alert" className="glass-card p-4 border-rose-400/50 text-sm text-rose-700 dark:text-rose-300">
          Erro: {error}
        </div>
      )}

      {/* 4 Annual KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 border border-emerald-500/25">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Receitas no Ano</p>
            <TrendingUp className="w-4 h-4 text-emerald-500" aria-hidden="true" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums money-value">
            {fmtBRL(data?.totals.income ?? 0)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Média: <span className="money-value">{fmtBRL((data?.totals.income ?? 0) / Math.max(1, activeMonths.length))}</span>/mês ativo
          </p>
        </div>

        <div className="glass-card p-5 border border-rose-500/25">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Despesas no Ano</p>
            <TrendingDown className="w-4 h-4 text-rose-500" aria-hidden="true" />
          </div>
          <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1 tabular-nums money-value">
            {fmtBRL(data?.totals.expenses ?? 0)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Média: <span className="money-value">{fmtBRL((data?.totals.expenses ?? 0) / Math.max(1, activeMonths.length))}</span>/mês ativo
          </p>
        </div>

        <div className="glass-card p-5 border border-blue-500/25">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Economia Líquida</p>
            <Wallet className="w-4 h-4 text-blue-500" aria-hidden="true" />
          </div>
          <p
            className={`text-2xl font-extrabold mt-1 tabular-nums money-value ${
              (data?.totals.net ?? 0) >= 0
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {fmtBRL(data?.totals.net ?? 0)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Taxa média anual: <strong>{annualSavingsRate}%</strong> da renda
          </p>
        </div>

        <div className="glass-card p-5 border border-amber-500/25">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Destaques do Ano</p>
            <Trophy className="w-4 h-4 text-amber-500" aria-hidden="true" />
          </div>
          {bestMonth ? (
            <div className="mt-1.5 space-y-1 text-xs">
              <p className="text-emerald-700 dark:text-emerald-300 font-semibold">
                Melhor: <strong>{bestMonth.fullLabel}</strong>{' '}
                <span className="money-value">({fmtBRL(bestMonth.net)})</span>
              </p>
              {worstMonth && worstMonth.month !== bestMonth.month && (
                <p className="text-rose-600 dark:text-rose-400 font-semibold">
                  Mais apertado: <strong>{worstMonth.fullLabel}</strong>{' '}
                  <span className="money-value">({fmtBRL(worstMonth.net)})</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-2">Sem dados em {year}.</p>
          )}
        </div>
      </section>

      {/* Combined Chart: Bars (Income vs Expense) + Line (Cumulative Balance) */}
      <section className="glass-card p-6">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-4">
          Receitas × Despesas &amp; Saldo Acumulado ({year})
        </h2>
        {loading ? (
          <div className="h-72 animate-pulse bg-white/40 dark:bg-white/5 rounded-2xl" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#64748b"
                tickFormatter={(v) => `R$${(Number(v) / 1000).toFixed(0)}k`}
              />
              <Tooltip formatter={(value) => fmtBRL(Number(value || 0))} />
              <Legend />
              <Bar dataKey="Receitas" fill="#10b981" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Despesas" fill="#ef4444" radius={[6, 6, 0, 0]} />
              <Line
                type="monotone"
                dataKey="Saldo Acumulado"
                stroke="#0071E3"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#0071E3' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Clickable 12-Month Breakdown Table */}
      <section className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/40 dark:border-white/10 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Detalhamento Mês a Mês ({year})
          </h2>
          <span className="text-xs text-slate-500">Clique em qualquer mês para abrir no Dashboard</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/45 dark:bg-white/5 border-b border-white/40 dark:border-white/10 text-xs uppercase tracking-wider text-slate-500">
                <th className="text-left px-5 py-3">Mês</th>
                <th className="text-right px-4 py-3">Receitas</th>
                <th className="text-right px-4 py-3">Despesas</th>
                <th className="text-right px-4 py-3">Saldo do Mês</th>
                <th className="text-right px-4 py-3">Acumulado</th>
                <th className="text-right px-5 py-3">Economia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/25 dark:divide-white/5">
              {enrichedMonths.map((m) => (
                <tr key={m.month} className="hover:bg-white/45 dark:hover:bg-white/5 transition">
                  <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">
                    <Link
                      href={`/dashboard?month=${m.ym}`}
                      className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                    >
                      {m.fullLabel}
                      <ArrowUpRight className="w-3.5 h-3.5 opacity-60 no-print" aria-hidden="true" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium money-value">
                    {fmtBRL(m.income)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-rose-600 dark:text-rose-400 font-medium money-value">
                    {fmtBRL(m.expenses)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums font-bold money-value ${
                      m.net >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {fmtBRL(m.net)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200 font-semibold money-value">
                    {fmtBRL(m.cumulative)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {m.income > 0 ? (
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          m.savingsPct >= 15
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : m.savingsPct >= 0
                              ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {m.savingsPct}%
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {data && (
              <tfoot className="bg-white/60 dark:bg-white/10 font-extrabold border-t-2 border-white/60 dark:border-white/15">
                <tr>
                  <td className="px-5 py-3.5 text-slate-900 dark:text-white">Total {year}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400 money-value">
                    {fmtBRL(data.totals.income)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-rose-600 dark:text-rose-400 money-value">
                    {fmtBRL(data.totals.expenses)}
                  </td>
                  <td
                    className={`px-4 py-3.5 text-right tabular-nums money-value ${
                      data.totals.net >= 0
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {fmtBRL(data.totals.net)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-slate-900 dark:text-white money-value">
                    {fmtBRL(data.totals.net)}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-slate-900 dark:text-white">
                    {annualSavingsRate}%
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  )
}

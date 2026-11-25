'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import {
  Scale,
  CalendarDays,
  FileSpreadsheet,
  TrendingUp,
  Copy,
  Check,
  Save,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

function pct(v: number): string {
  const sign = v > 0 ? '+' : ''
  return `${sign}${(v || 0).toFixed(2).replace('.', ',')}%`
}

// ============ 1. Performance vs CDI / IBOV / IPCA ============

interface PerformanceData {
  series: Array<{
    ym: string
    label: string
    portfolio_pct: number
    cdi_pct: number
    ibov_pct: number
    ipca_pct: number
  }>
  summary: {
    portfolio_12m_pct: number
    cdi_12m_pct: number
    ibov_12m_pct: number
    ipca_12m_pct: number
    alpha_vs_cdi: number
    alpha_vs_ibov: number
    pct_of_cdi: number
  }
}

export function PerformancePanel({ token }: { token: string }) {
  const [data, setData] = useState<PerformanceData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    fetch(`${API_URL}/investments/performance`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Calculando rentabilidade vs CDI, IBOV e IPCA...</div>
  }
  if (!data) {
    return <div className="p-8 text-sm text-slate-500">Não foi possível carregar a rentabilidade histórica.</div>
  }

  const s = data.summary

  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="glass-card p-3.5">
          <p className="text-[11px] text-slate-500">Carteira (12m + Proventos)</p>
          <p
            className={`text-xl font-extrabold mt-1 ${
              s.portfolio_12m_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
            }`}
          >
            {pct(s.portfolio_12m_pct)}
          </p>
        </div>
        <div className="glass-card p-3.5">
          <p className="text-[11px] text-slate-500">CDI Acumulado (12m)</p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {pct(s.cdi_12m_pct)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{s.pct_of_cdi.toFixed(0)}% do CDI</p>
        </div>
        <div className="glass-card p-3.5">
          <p className="text-[11px] text-slate-500">IBOVESPA (12m)</p>
          <p className="text-xl font-bold text-sky-600 dark:text-sky-400 mt-1">
            {pct(s.ibov_12m_pct)}
          </p>
        </div>
        <div className="glass-card p-3.5">
          <p className="text-[11px] text-slate-500">IPCA (Inflação 12m)</p>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">
            {pct(s.ipca_12m_pct)}
          </p>
        </div>
        <div className="glass-card p-3.5">
          <p className="text-[11px] text-slate-500">Alpha vs CDI</p>
          <p
            className={`text-xl font-extrabold mt-1 ${
              s.alpha_vs_cdi >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
            }`}
          >
            {pct(s.alpha_vs_cdi)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">vs IBOV: {pct(s.alpha_vs_ibov)}</p>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
            Rentabilidade Acumulada (12 meses) · Carteira vs Benchmarks
          </h3>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(v) => `${Number(v ?? 0).toFixed(2)}%`}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.4)',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="portfolio_pct" name="Carteira Mony" stroke="#10b981" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="cdi_pct" name="CDI" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="ibov_pct" name="IBOVESPA" stroke="#0071E3" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="ipca_pct" name="IPCA" stroke="#8b5cf6" strokeWidth={1.8} strokeDasharray="2 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ============ 2. Rebalanceamento Inteligente ("Onde Aportar") ============

interface RebalanceRow {
  asset_class: string
  label: string
  current_value: number
  current_pct: number
  target_pct: number
  diff_pct: number
  suggested_contribution: number
  projected_pct: number
  suggested_tickers: string[]
}

interface RebalanceData {
  contribution: number
  current_total: number
  projected_total: number
  targets: Record<string, number>
  plan: RebalanceRow[]
}

export function RebalancePanel({ token }: { token: string }) {
  const [contribution, setContribution] = useState('2000')
  const [data, setData] = useState<RebalanceData | null>(null)
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const fetchPlan = useCallback(
    async (amt: number) => {
      if (!token) return
      const res = await fetch(`${API_URL}/investments/rebalance?contribution=${amt}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const d: RebalanceData = await res.json()
        setData(d)
        setTargets(d.targets)
      }
    },
    [token]
  )

  useEffect(() => {
    const val = Math.max(0, Number(contribution) || 0)
    const t = setTimeout(() => fetchPlan(val), 250)
    return () => clearTimeout(t)
  }, [contribution, fetchPlan])

  const targetSum = Object.values(targets).reduce((acc, v) => acc + (Number(v) || 0), 0)

  const saveTargets = async () => {
    if (!token) return
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`${API_URL}/investments/targets`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targets }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Erro ao salvar metas')
      }
      setMsg('Metas de alocação salvas! Plano de aporte recalculado.')
      await fetchPlan(Math.max(0, Number(contribution) || 0))
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-5 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Scale className="w-4 h-4 text-[var(--accent)]" />
            Rebalanceamento Inteligente · Onde Aportar Este Mês
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Defina sua alocação alvo por classe e informe o valor do aporte — o Mony calcula exatamente quanto comprar sem precisar vender nada.
          </p>
        </div>

        <div className="flex items-end gap-2">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              Aporte deste mês (R$)
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={contribution}
              onChange={(e) => setContribution(e.target.value)}
              className="w-40 px-3 py-2 glass-input rounded-xl text-sm font-bold"
            />
          </div>
          <button
            type="button"
            onClick={saveTargets}
            disabled={saving || Math.abs(targetSum - 100) > 0.5}
            className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Salvando...' : `Salvar Metas (${targetSum.toFixed(0)}%)`}
          </button>
        </div>
      </div>

      {msg && (
        <div className="glass-card p-3 text-xs font-medium text-emerald-700 dark:text-emerald-300 border-emerald-400/40">
          {msg}
        </div>
      )}

      {data && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/45 dark:bg-white/5 border-b border-white/40 dark:border-white/10 text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Classe</th>
                <th className="px-3 py-3 text-right">Saldo Atual</th>
                <th className="px-3 py-3 text-right">% Atual</th>
                <th className="px-3 py-3 text-center">% Meta Alvo</th>
                <th className="px-3 py-3 text-right">Desvio</th>
                <th className="px-3 py-3 text-right">Aporte Sugerido</th>
                <th className="px-3 py-3 text-right">% Após Aporte</th>
                <th className="px-4 py-3 text-left">Sugestão na Carteira</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/30 dark:divide-white/5">
              {data.plan.map((row) => (
                <tr key={row.asset_class} className="hover:bg-white/30 dark:hover:bg-white/5">
                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{row.label}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{brl(row.current_value)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.current_pct.toFixed(1)}%</td>
                  <td className="px-3 py-3 text-center">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      value={targets[row.asset_class] ?? row.target_pct}
                      onChange={(e) =>
                        setTargets((prev) => ({
                          ...prev,
                          [row.asset_class]: Number(e.target.value) || 0,
                        }))
                      }
                      className="w-16 px-2 py-1 text-center glass-input rounded-lg text-xs font-bold"
                    />
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums font-semibold ${
                      row.diff_pct < -2
                        ? 'text-amber-600 dark:text-amber-400'
                        : row.diff_pct > 2
                          ? 'text-sky-600 dark:text-sky-400'
                          : 'text-emerald-600'
                    }`}
                  >
                    {pct(row.diff_pct)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-extrabold text-emerald-600 dark:text-emerald-400">
                    {row.suggested_contribution > 0 ? brl(row.suggested_contribution) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.projected_pct.toFixed(1)}%</td>
                  <td className="px-4 py-3">
                    {row.suggested_tickers.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {row.suggested_tickers.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent)]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400">Novo ativo da classe</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============ 3. Agenda de Proventos (Projeção 12m) ============

interface CalendarData {
  annual_projected: number
  monthly_avg_projected: number
  months: Array<{
    ym: string
    label: string
    estimated_total: number
    fii_total: number
    stock_total: number
    payers: Array<{ ticker: string; amount: number }>
  }>
  by_asset: Array<{
    ticker: string
    asset_class: string
    dy_12m: number
    annual_estimated: number
    monthly_avg: number
  }>
}

export function DividendCalendarPanel({ token }: { token: string }) {
  const [data, setData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    fetch(`${API_URL}/investments/dividends/calendar`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="p-8 text-sm text-slate-500">Projetando agenda de proventos 12m...</div>
  if (!data) return <div className="p-8 text-sm text-slate-500">Sem dados de projeção.</div>

  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">Renda Passiva Projetada (Próximos 12m)</p>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
            {brl(data.annual_projected)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Baseado no DY 12m real da B3 sobre sua posição atual</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">Média Mensal Estimada</p>
          <p className="text-2xl font-extrabold text-[var(--accent)] mt-1">
            {brl(data.monthly_avg_projected)} / mês
          </p>
          <p className="text-[11px] text-slate-500 mt-1">FIIs mensais + Ações distribuídas trimestralmente</p>
        </div>
      </div>

      <div className="glass-card p-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
          <CalendarDays className="w-4 h-4 text-emerald-500" />
          Agenda Mensal Estimada (FIIs + Ações)
        </h3>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.months}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
              <Tooltip
                formatter={(v) => brl(Number(v ?? 0))}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.4)',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="fii_total" stackId="a" name="FIIs (mensal)" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="stock_total" stackId="a" name="Ações (trimestral)" fill="#0071E3" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {data.by_asset.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.by_asset.slice(0, 9).map((item) => (
            <div key={item.ticker} className="glass-card p-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">{item.ticker}</p>
                <p className="text-[11px] text-slate-500">DY 12m: {item.dy_12m.toFixed(2)}%</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {brl(item.annual_estimated)}/ano
                </p>
                <p className="text-[10px] text-slate-500">~{brl(item.monthly_avg)}/mês</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ 4. Resumo IRPF B3 ============

interface TaxReportData {
  year: number
  total_cost_year_end: number
  total_darf_estimated: number
  income_summary: {
    dividends_exempt: number
    fii_yields_exempt: number
    total_exempt: number
    jcp_exclusive: number
  }
  bens_e_direitos: Array<{
    ticker: string
    name: string
    asset_class_label: string
    irpf_group: string
    irpf_code: string
    irpf_label: string
    quantity: number
    average_price: number
    total_cost: number
    discriminacao: string
  }>
  monthly_sales: Array<{
    month: number
    label: string
    stock_sales: number
    stock_gain: number
    stock_exempt_20k: boolean
    fii_sales: number
    fii_gain: number
    darf_estimated: number
  }>
}

export function TaxReportPanel({ token }: { token: string }) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState<TaxReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedTicker, setCopiedTicker] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    fetch(`${API_URL}/investments/tax-report?year=${year}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [token, year])

  const copyText = (ticker: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text)
      setCopiedTicker(ticker)
      setTimeout(() => setCopiedTicker(null), 2000)
    }
  }

  return (
    <div className="p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[var(--accent)]" />
            Auxiliar de Imposto de Renda · B3 (IRPF {year})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Posição em 31/12/{year} (Bens e Direitos), monitor mensal da isenção de R$ 20 mil em ações e proventos isentos vs JCP.
          </p>
        </div>

        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="px-3 py-2 glass-input rounded-xl text-xs font-bold"
        >
          {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
            <option key={y} value={y}>
              Ano-Calendário {y}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-slate-500">Consolidando relatório IRPF {year}...</div>
      ) : !data ? (
        <div className="p-6 text-sm text-slate-500">Sem dados para {year}.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="glass-card p-3.5">
              <p className="text-[11px] text-slate-500">Bens e Direitos (31/12/{year})</p>
              <p className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
                {brl(data.total_cost_year_end)}
              </p>
              <p className="text-[10px] text-slate-500">Custo de aquisição</p>
            </div>
            <div className="glass-card p-3.5">
              <p className="text-[11px] text-slate-500">Rendimentos Isentos</p>
              <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {brl(data.income_summary.total_exempt)}
              </p>
              <p className="text-[10px] text-slate-500">
                Div: {brl(data.income_summary.dividends_exempt)} · FIIs: {brl(data.income_summary.fii_yields_exempt)}
              </p>
            </div>
            <div className="glass-card p-3.5">
              <p className="text-[11px] text-slate-500">JCP (Tributação Exclusiva)</p>
              <p className="text-lg font-bold text-sky-600 dark:text-sky-400 mt-1">
                {brl(data.income_summary.jcp_exclusive)}
              </p>
            </div>
            <div className="glass-card p-3.5">
              <p className="text-[11px] text-slate-500">DARF Estimado ({year})</p>
              <p
                className={`text-lg font-extrabold mt-1 ${
                  data.total_darf_estimated > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'
                }`}
              >
                {brl(data.total_darf_estimated)}
              </p>
              <p className="text-[10px] text-slate-500">15% Ações &gt;20k · 20% FIIs</p>
            </div>
          </div>

          {/* Bens e Direitos Table */}
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/30 dark:border-white/10">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Ficha: Bens e Direitos ({data.bens_e_direitos.length} ativos em 31/12/{year})
              </h4>
            </div>
            {data.bens_e_direitos.length === 0 ? (
              <p className="p-6 text-xs text-slate-500 text-center">Nenhum ativo em custódia registrado até 31/12/{year}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/40 dark:bg-white/5 text-slate-500">
                      <th className="px-4 py-2.5 text-left">Grupo/Cód.</th>
                      <th className="px-3 py-2.5 text-left">Ativo</th>
                      <th className="px-3 py-2.5 text-right">Qtd</th>
                      <th className="px-3 py-2.5 text-right">Preço Médio</th>
                      <th className="px-3 py-2.5 text-right">Situação 31/12</th>
                      <th className="px-4 py-2.5 text-right">Discriminação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/25 dark:divide-white/5">
                    {data.bens_e_direitos.map((b) => (
                      <tr key={b.ticker}>
                        <td className="px-4 py-2.5 font-mono text-[11px]">
                          {b.irpf_group} / {b.irpf_code}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-bold text-slate-900 dark:text-white">{b.ticker}</span>
                          <span className="text-[10px] text-slate-500 block">{b.asset_class_label}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{b.quantity}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{brl(b.average_price)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold">{brl(b.total_cost)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => copyText(b.ticker, b.discriminacao)}
                            className="liquid-btn liquid-btn-glass px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
                          >
                            {copiedTicker === b.ticker ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" /> Copiado!
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" /> Copiar texto IRPF
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Monthly Sales Monitor (20k rule) */}
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/30 dark:border-white/10">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Vendas Mensais &amp; Regra de Isenção (R$ 20.000/mês em Ações)
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/40 dark:bg-white/5 text-slate-500">
                    <th className="px-4 py-2 text-left">Mês</th>
                    <th className="px-3 py-2 text-right">Vendas Ações</th>
                    <th className="px-3 py-2 text-right">Lucro Ações</th>
                    <th className="px-3 py-2 text-center">Regra 20k</th>
                    <th className="px-3 py-2 text-right">Vendas FIIs</th>
                    <th className="px-3 py-2 text-right">DARF Estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/25 dark:divide-white/5">
                  {data.monthly_sales.map((m) => (
                    <tr key={m.month}>
                      <td className="px-4 py-2 font-semibold">{m.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{brl(m.stock_sales)}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          m.stock_gain > 0 ? 'text-emerald-600' : m.stock_gain < 0 ? 'text-rose-600' : ''
                        }`}
                      >
                        {brl(m.stock_gain)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {m.stock_sales === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : m.stock_exempt_20k ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" /> Isento
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3" /> Tributável
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{brl(m.fii_sales)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">
                        {m.darf_estimated > 0 ? brl(m.darf_estimated) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

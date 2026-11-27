'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { LineChart as LineChartIcon, LayoutGrid, Plus, Trash2, Play } from 'lucide-react'
import { fmtBrl, fmtPct } from './ValuerTypes'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface BacktestSeriesPoint {
  ym: string
  label: string
  portfolio: number
  ibov: number
  cdi: number
  portfolio_ret_pct: number
}

interface BacktestResult {
  initial_amount: number
  final_portfolio: number
  final_ibov: number
  final_cdi: number
  portfolio_return_pct: number
  ibov_return_pct: number
  cdi_return_pct: number
  alpha_vs_ibov_pct: number
  alpha_vs_cdi_pct: number
  annualized_volatility_pct: number
  max_drawdown_pct: number
  series: BacktestSeriesPoint[]
}

const MODEL_PORTFOLIOS: Array<{
  label: string
  holdings: Array<{ ticker: string; weight: number }>
}> = [
  {
    label: 'Previdenciária B.E.S.T.',
    holdings: [
      { ticker: 'BBAS3', weight: 25 },
      { ticker: 'TAEE11', weight: 25 },
      { ticker: 'BBSE3', weight: 25 },
      { ticker: 'SAPR11', weight: 25 },
    ],
  },
  {
    label: 'Renda Mensal FIIs',
    holdings: [
      { ticker: 'HGLG11', weight: 25 },
      { ticker: 'KNCR11', weight: 25 },
      { ticker: 'XPML11', weight: 25 },
      { ticker: 'MXRF11', weight: 25 },
    ],
  },
  {
    label: 'Barbell Brasil + Global',
    holdings: [
      { ticker: 'IVVB11', weight: 35 },
      { ticker: 'BBAS3', weight: 25 },
      { ticker: 'WEGE3', weight: 20 },
      { ticker: 'HGLG11', weight: 20 },
    ],
  },
  {
    label: 'Big Tech BDRs + Ouro',
    holdings: [
      { ticker: 'MSFT34', weight: 30 },
      { ticker: 'AAPL34', weight: 25 },
      { ticker: 'NVDC34', weight: 25 },
      { ticker: 'GOLD11', weight: 20 },
    ],
  },
]

export function BacktestPanel({ token }: { token?: string }) {
  const [holdings, setHoldings] = useState<Array<{ ticker: string; weight: number }>>(MODEL_PORTFOLIOS[0].holdings)
  const [initialAmount, setInitialAmount] = useState('10000')
  const [newTicker, setNewTicker] = useState('')
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [loading, setLoading] = useState(false)

  const runBacktest = useCallback(async () => {
    if (!token || holdings.length === 0) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/valuer/backtest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          initial_amount: Math.max(100, Number(initialAmount) || 10000),
          holdings,
        }),
      })
      if (res.ok) setResult(await res.json())
    } finally {
      setLoading(false)
    }
  }, [token, holdings, initialAmount])

  useEffect(() => {
    runBacktest()
  }, [runBacktest])

  const addHolding = (e: React.FormEvent) => {
    e.preventDefault()
    const tk = newTicker.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!tk || holdings.some((h) => h.ticker === tk) || holdings.length >= 12) return
    setHoldings([...holdings, { ticker: tk, weight: 20 }])
    setNewTicker('')
  }

  return (
    <div className="space-y-5">
      <div className="glass-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
              style={{ background: 'var(--accent)' }}
            >
              <LineChartIcon className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Backtest 12 Meses · Carteira Modelo vs IBOV &amp; CDI
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Simule retornos acumulados com proventos, volatilidade e drawdown nos últimos 12 meses
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 liquid-input py-1.5 px-3 text-xs">
              <span className="text-slate-500">Inicial:</span>
              <input
                type="number"
                min={100}
                step={1000}
                value={initialAmount}
                onChange={(e) => setInitialAmount(e.target.value)}
                className="w-24 bg-transparent font-bold tabular-nums focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={runBacktest}
              disabled={loading}
              className="liquid-btn liquid-btn-primary px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              {loading ? 'Rodando...' : 'Simular'}
            </button>
          </div>
        </div>

        {/* Model presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase text-slate-500">Carteiras Modelo:</span>
          {MODEL_PORTFOLIOS.map((m) => (
            <button
              key={m.label}
              type="button"
              onClick={() => setHoldings(m.holdings)}
              className="liquid-btn liquid-btn-glass px-3 py-1 rounded-full text-xs font-semibold"
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Editable holdings pills */}
        <div className="flex flex-wrap items-center gap-2">
          {holdings.map((h) => (
            <div
              key={h.ticker}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/60 dark:bg-white/10 border border-white/60 dark:border-white/15 text-xs"
            >
              <strong className="text-slate-900 dark:text-white">{h.ticker}</strong>
              <input
                type="number"
                min={1}
                max={100}
                value={h.weight}
                onChange={(e) => {
                  const w = Math.max(1, Number(e.target.value) || 1)
                  setHoldings((prev) => prev.map((x) => (x.ticker === h.ticker ? { ...x, weight: w } : x)))
                }}
                className="w-11 text-right bg-transparent font-bold text-blue-600 dark:text-blue-400 tabular-nums focus:outline-none"
              />
              <span className="text-[10px] text-slate-500">pts</span>
              {holdings.length > 1 && (
                <button
                  type="button"
                  onClick={() => setHoldings((prev) => prev.filter((x) => x.ticker !== h.ticker))}
                  aria-label={`Remover ${h.ticker}`}
                  className="text-slate-400 hover:text-rose-500"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <form onSubmit={addHolding} className="inline-flex items-center gap-1">
            <input
              type="text"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              placeholder="+ Ticker"
              className="liquid-input py-1 px-2.5 text-xs w-28 uppercase"
            />
            <button type="submit" className="liquid-btn liquid-btn-glass p-1.5 rounded-xl" aria-label="Adicionar ativo">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* Backtest Results */}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="glass-card p-4 border-blue-400/35 bg-blue-500/5">
              <p className="text-[11px] font-semibold uppercase text-slate-500">Sua Carteira (12m)</p>
              <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
                {fmtPct(result.portfolio_return_pct, true)}
              </p>
              <p className="text-[11px] text-slate-500 tabular-nums money-value">
                Final: {fmtBrl(result.final_portfolio)}
              </p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-500">Alpha vs IBOV</p>
              <p
                className={`text-xl font-extrabold mt-1 tabular-nums ${
                  result.alpha_vs_ibov_pct >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {fmtPct(result.alpha_vs_ibov_pct, true)}
              </p>
              <p className="text-[11px] text-slate-500">IBOV: {fmtPct(result.ibov_return_pct, true)}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-500">Alpha vs CDI</p>
              <p
                className={`text-xl font-extrabold mt-1 tabular-nums ${
                  result.alpha_vs_cdi_pct >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {fmtPct(result.alpha_vs_cdi_pct, true)}
              </p>
              <p className="text-[11px] text-slate-500">CDI: {fmtPct(result.cdi_return_pct, true)}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-500">Volatilidade Anual</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                {fmtPct(result.annualized_volatility_pct)}
              </p>
              <p className="text-[11px] text-slate-500">Risco histórico 12m</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-500">Max Drawdown</p>
              <p className="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
                {fmtPct(result.max_drawdown_pct)}
              </p>
              <p className="text-[11px] text-slate-500">Maior queda pico→vale</p>
            </div>
          </div>

          <div className="glass-panel p-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.series} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '14px',
                    background: 'rgba(15,23,42,0.92)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                  formatter={(val: unknown, name?: string | number) => [
                    fmtBrl(Number(val || 0)),
                    name === 'portfolio' ? 'Sua Carteira' : name === 'ibov' ? 'IBOVESPA' : 'CDI',
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="portfolio" name="Sua Carteira" stroke="#0071E3" strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="cdi" name="CDI" stroke="#10b981" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                <Line type="monotone" dataKey="ibov" name="IBOVESPA" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

interface SectorHeatmapGroup {
  sector: string
  count: number
  avg_margin_of_safety_pct: number
  avg_dy_12m: number
  avg_change_pct: number
  avg_score: number
  top_ticker: string
  assets: Array<{
    ticker: string
    name: string
    price: number
    change_pct: number
    margin_of_safety_pct: number
    dy_12m: number
    score: number
    verdict: string
  }>
}

export function SectorHeatmapPanel({
  token,
  onOpenDossier,
}: {
  token?: string
  onOpenDossier: (ticker: string) => void
}) {
  const [sectors, setSectors] = useState<SectorHeatmapGroup[]>([])
  const [colorMode, setColorMode] = useState<'mos' | 'dy' | 'score'>('mos')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    fetch(`${API_URL}/valuer/sector-heatmap`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.sectors) setSectors(d.sectors)
      })
      .finally(() => setLoading(false))
  }, [token])

  const tileColor = (a: SectorHeatmapGroup['assets'][number]) => {
    if (colorMode === 'mos') {
      if (a.margin_of_safety_pct >= 20) return 'bg-emerald-600/90 text-white border-emerald-400/50'
      if (a.margin_of_safety_pct >= 5) return 'bg-emerald-500/75 text-white border-emerald-400/40'
      if (a.margin_of_safety_pct >= -10) return 'bg-amber-500/75 text-white border-amber-300/40'
      return 'bg-rose-500/80 text-white border-rose-300/40'
    }
    if (colorMode === 'dy') {
      if (a.dy_12m >= 10) return 'bg-emerald-600/90 text-white border-emerald-400/50'
      if (a.dy_12m >= 6) return 'bg-blue-600/80 text-white border-blue-400/40'
      return 'bg-slate-600/75 text-white border-slate-400/40'
    }
    if (a.score >= 80) return 'bg-emerald-600/90 text-white border-emerald-400/50'
    if (a.score >= 65) return 'bg-blue-600/80 text-white border-blue-400/40'
    return 'bg-slate-600/75 text-white border-slate-400/40'
  }

  return (
    <div className="space-y-5">
      <div className="glass-panel p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm"
            style={{ background: 'var(--accent)' }}
          >
            <LayoutGrid className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Mapa de Calor Setorial · B3 &amp; Internacional
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Visualize rapidamente onde estão os maiores descontos, dividendos e scores por setor · clique em qualquer bloco para abrir o Dossiê
            </p>
          </div>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-white/55 dark:bg-white/10 border border-white/60 dark:border-white/15 text-xs">
          {(
            [
              ['mos', 'Margem de Segurança'],
              ['dy', 'Dividend Yield'],
              ['score', 'Mony Score'],
            ] as const
          ).map(([id, lbl]) => (
            <button
              key={id}
              type="button"
              onClick={() => setColorMode(id)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                colorMode === id ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-80 glass-panel animate-pulse" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sectors.map((sec) => (
            <div key={sec.sector} className="glass-panel p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{sec.sector}</h3>
                  <p className="text-[11px] text-slate-500">
                    {sec.count} ativo(s) · DY médio {fmtPct(sec.avg_dy_12m)} · Score {sec.avg_score}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/65 dark:bg-white/10 text-slate-700 dark:text-slate-200 tabular-nums">
                  {fmtPct(sec.avg_margin_of_safety_pct, true)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {sec.assets.map((a) => (
                  <button
                    key={a.ticker}
                    type="button"
                    onClick={() => onOpenDossier(a.ticker)}
                    className={`p-2.5 rounded-xl border text-left transition hover:scale-[1.03] shadow-sm ${tileColor(a)}`}
                  >
                    <p className="text-xs font-extrabold tracking-tight">{a.ticker}</p>
                    <p className="text-[11px] font-bold tabular-nums opacity-95">
                      {colorMode === 'mos'
                        ? fmtPct(a.margin_of_safety_pct, true)
                        : colorMode === 'dy'
                        ? fmtPct(a.dy_12m)
                        : `${a.score} pts`}
                    </p>
                    <p className="text-[10px] opacity-80 tabular-nums">{fmtBrl(a.price)}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

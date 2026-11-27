'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import {
  X,
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle2,
  XCircle,
  Star,
  Sparkles,
  Sliders,
  ShieldCheck,
} from 'lucide-react'
import { fmtBrl, fmtPct, verdictBadgeClasses, type ValuerAsset } from './ValuerTypes'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface TechSeriesPoint {
  date: string
  label: string
  close: number
  sma20?: number | null
  sma50?: number | null
  rsi14?: number | null
}

interface DossierPayload {
  valuation: ValuerAsset
  technicals: {
    series: TechSeriesPoint[]
    sma20?: number | null
    sma50?: number | null
    sma200?: number | null
    rsi14?: number | null
    rsi_signal: 'sobrevendido' | 'neutro' | 'sobrecomprado'
    trend: 'alta' | 'baixa' | 'lateral'
    support?: number | null
    resistance?: number | null
    high_52w?: number | null
    low_52w?: number | null
  }
  position: {
    quantity: number
    average_price: number
    current_value: number
    gain_pct: number
  } | null
}

export function AssetDossierModal({
  ticker,
  token,
  onClose,
  onAddWatchlist,
  onAddCompare,
}: {
  ticker: string | null
  token?: string
  onClose: () => void
  onAddWatchlist?: (asset: ValuerAsset) => void
  onAddCompare?: (ticker: string) => void
}) {
  const [data, setData] = useState<DossierPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [minDyBazin, setMinDyBazin] = useState(6.0)
  const [discountRate, setDiscountRate] = useState(12.5)
  const [growthRate, setGrowthRate] = useState(4.0)

  const load = useCallback(async () => {
    if (!ticker || !token) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        min_dy_bazin: String(minDyBazin),
        discount_rate: String(discountRate),
        growth_rate: String(growthRate),
      })
      const res = await fetch(`${API_URL}/valuer/asset/${encodeURIComponent(ticker)}?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setData(await res.json())
      }
    } finally {
      setLoading(false)
    }
  }, [ticker, token, minDyBazin, discountRate, growthRate])

  useEffect(() => {
    if (!ticker) return
    const t = setTimeout(load, 150)
    return () => clearTimeout(t)
  }, [ticker, load])

  useEffect(() => {
    if (!ticker) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ticker, onClose])

  if (!ticker) return null

  const v = data?.valuation
  const tech = data?.technicals

  const handleAskAI = () => {
    if (!v) return
    const summary = `Analise ${v.ticker} (${v.name}): Cotação ${fmtBrl(v.price)}, Preço Teto Bazin ${fmtBrl(v.bazin_price)}, Preço Justo Graham ${fmtBrl(v.graham_price)}, Consenso ${fmtBrl(v.consensus_price)} (Margem de Segurança ${fmtPct(v.margin_of_safety_pct, true)}), DY 12m ${fmtPct(v.dy_12m)}, P/L ${v.pe_ratio ?? '—'}, P/VP ${v.pvp_ratio ?? '—'}, ROE ${fmtPct(v.roe)}, RSI(14) ${tech?.rsi14 ?? '—'}. Vale aportar agora pensando em longo prazo?`
    navigator.clipboard?.writeText(summary).catch(() => undefined)
    window.dispatchEvent(new CustomEvent('mony:open-ai', { detail: { tab: 'chat', prompt: summary } }))
    dispatchToast(`Prompt completo de ${v.ticker} copiado e enviado para a Mony IA!`, 'success')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dossier-title"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-5xl max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id="dossier-title" className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {ticker}
              </h2>
              {v && (
                <>
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{v.name}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${verdictBadgeClasses(v.verdict)}`}>
                    {v.verdict_label} ({fmtPct(v.margin_of_safety_pct, true)})
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300">
                    Score {v.score}/100
                  </span>
                </>
              )}
            </div>
            {v && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {v.sector} · Cotação atual:{' '}
                <strong className="text-slate-900 dark:text-white tabular-nums">{fmtBrl(v.price)}</strong>{' '}
                <span className={v.change_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>
                  ({fmtPct(v.change_pct, true)})
                </span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {v && onAddWatchlist && (
              <button
                type="button"
                onClick={() => onAddWatchlist(v)}
                className="liquid-btn liquid-btn-glass px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Star className="w-3.5 h-3.5 text-amber-500" />
                Watchlist
              </button>
            )}
            {v && onAddCompare && (
              <button
                type="button"
                onClick={() => {
                  onAddCompare(v.ticker)
                  dispatchToast(`${v.ticker} adicionado ao Mata-Mata!`, 'info')
                }}
                className="liquid-btn liquid-btn-glass px-3 py-1.5 rounded-xl text-xs font-semibold"
              >
                + Mata-Mata
              </button>
            )}
            {v && (
              <button
                type="button"
                onClick={handleAskAI}
                className="liquid-btn liquid-btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Analisar com IA
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar dossiê"
              className="p-2 rounded-xl text-slate-500 hover:bg-white/60 dark:hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading && !v ? (
          <div className="h-64 glass-card animate-pulse" />
        ) : v ? (
          <>
            {/* User Position Banner if held */}
            {data?.position && (
              <div className="glass-card p-3.5 border-blue-400/35 bg-blue-500/8 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-blue-800 dark:text-blue-200">
                  💼 Você possui <strong>{data.position.quantity}</strong> cotas/ações na carteira · PM{' '}
                  <strong className="tabular-nums">{fmtBrl(data.position.average_price)}</strong>
                </span>
                <span className="font-bold tabular-nums money-value text-slate-900 dark:text-white">
                  Posição: {fmtBrl(data.position.current_value)}{' '}
                  <span className={data.position.gain_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                    ({fmtPct(data.position.gain_pct, true)})
                  </span>
                </span>
              </div>
            )}

            {/* 4 Valuation Models Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="glass-card p-4">
                <p className="text-[11px] font-semibold uppercase text-slate-500">Preço Teto Bazin</p>
                <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {fmtBrl(v.bazin_price)}
                </p>
                <p className={`text-[11px] font-semibold mt-0.5 ${v.bazin_mos_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  Margem: {fmtPct(v.bazin_mos_pct, true)} (DY alvo {minDyBazin}%)
                </p>
              </div>
              <div className="glass-card p-4">
                <p className="text-[11px] font-semibold uppercase text-slate-500">
                  {v.asset_class === 'fii' ? 'Valor Patrimonial (VPA)' : 'Preço Justo Graham'}
                </p>
                <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {fmtBrl(v.graham_price)}
                </p>
                <p className={`text-[11px] font-semibold mt-0.5 ${v.graham_mos_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  Margem: {fmtPct(v.graham_mos_pct, true)}
                </p>
              </div>
              <div className="glass-card p-4">
                <p className="text-[11px] font-semibold uppercase text-slate-500">Modelo Gordon (DDM)</p>
                <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {fmtBrl(v.gordon_price)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  k={discountRate}% · g={growthRate}%
                </p>
              </div>
              <div className="glass-card p-4 border-blue-400/40 bg-blue-500/5">
                <p className="text-[11px] font-semibold uppercase text-blue-700 dark:text-blue-300">
                  Consenso Valuer
                </p>
                <p className="text-xl font-extrabold text-blue-700 dark:text-blue-300 mt-1 tabular-nums">
                  {fmtBrl(v.consensus_price)}
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                  DY 12m: <strong>{fmtPct(v.dy_12m)}</strong> · Spread IPCA: {fmtPct(v.real_yield_spread_pct, true)}
                </p>
              </div>
            </div>

            {/* Interactive Valuation Sliders */}
            <div className="glass-card p-4 space-y-3">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-blue-500" />
                Ajustar Premissas de Precificação ao Vivo
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <label className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">DY Mínimo Bazin</span>
                    <strong className="tabular-nums">{minDyBazin.toFixed(1)}%</strong>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={14}
                    step={0.5}
                    value={minDyBazin}
                    onChange={(e) => setMinDyBazin(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </label>
                <label className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Taxa de Desconto (k)</span>
                    <strong className="tabular-nums">{discountRate.toFixed(1)}%</strong>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={20}
                    step={0.5}
                    value={discountRate}
                    onChange={(e) => setDiscountRate(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </label>
                <label className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Crescimento Perpétuo (g)</span>
                    <strong className="tabular-nums">{growthRate.toFixed(1)}%</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    step={0.5}
                    value={growthRate}
                    onChange={(e) => setGrowthRate(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </label>
              </div>
            </div>

            {/* Technical Analysis (Price + SMA20/50 + Support/Resistance + RSI 14) */}
            {tech && (
              <div className="glass-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-blue-500" />
                    Análise Técnica · Médias Móveis, Suporte/Resistência &amp; RSI(14)
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${
                        tech.trend === 'alta'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : tech.trend === 'baixa'
                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tech.trend === 'alta' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      Tendência: {tech.trend.toUpperCase()}
                    </span>
                    {tech.rsi14 !== null && tech.rsi14 !== undefined && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-bold ${
                          tech.rsi_signal === 'sobrevendido'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : tech.rsi_signal === 'sobrecomprado'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            : 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        RSI(14): {tech.rsi14} · {tech.rsi_signal}
                      </span>
                    )}
                    {tech.support && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                        Suporte: {fmtBrl(tech.support)}
                      </span>
                    )}
                    {tech.resistance && (
                      <span className="text-rose-600 dark:text-rose-400 font-semibold tabular-nums">
                        Resistência: {fmtBrl(tech.resistance)}
                      </span>
                    )}
                  </div>
                </div>

                {tech.series.length > 0 ? (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={tech.series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="monyTechPriceGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0071E3" stopOpacity={0.28} />
                            <stop offset="95%" stopColor="#0071E3" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          interval={Math.max(1, Math.floor(tech.series.length / 8))}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          domain={['auto', 'auto']}
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          tickFormatter={(val) => `R$${Number(val).toFixed(0)}`}
                          axisLine={false}
                          tickLine={false}
                          width={50}
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
                            name === 'close' ? 'Fechamento' : name === 'sma20' ? 'MM20' : 'MM50',
                          ]}
                        />
                        {tech.support && <ReferenceLine y={tech.support} stroke="#10b981" strokeDasharray="4 4" />}
                        {tech.resistance && <ReferenceLine y={tech.resistance} stroke="#f43f5e" strokeDasharray="4 4" />}
                        <Area type="monotone" dataKey="close" stroke="#0071E3" strokeWidth={2} fill="url(#monyTechPriceGrad)" />
                        <Line type="monotone" dataKey="sma20" stroke="#8b5cf6" strokeWidth={1.6} dot={false} />
                        <Line type="monotone" dataKey="sma50" stroke="#f59e0b" strokeWidth={1.6} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    Série histórica indisponível no momento — indicadores fundamentalistas atualizados abaixo.
                  </p>
                )}

                {tech.high_52w && tech.low_52w && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                    <span>Mínima 52 sem: <strong className="text-slate-800 dark:text-slate-200">{fmtBrl(tech.low_52w)}</strong></span>
                    <span>MM20: <strong>{fmtBrl(tech.sma20)}</strong> · MM50: <strong>{fmtBrl(tech.sma50)}</strong> · MM200: <strong>{fmtBrl(tech.sma200)}</strong></span>
                    <span>Máxima 52 sem: <strong className="text-slate-800 dark:text-slate-200">{fmtBrl(tech.high_52w)}</strong></span>
                  </div>
                )}
              </div>
            )}

            {/* Fundamentalist Checklist (Adapta Valuer style) */}
            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Checklist Fundamentalista Valuer ({v.checklist_passed}/{v.checklist_total} critérios aprovados)
                </h3>
                <span className="text-xs text-slate-500">
                  LPA {fmtBrl(v.lpa)} · VPA {fmtBrl(v.vpa)} · DPA 12m {fmtBrl(v.dpa_12m)}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {v.checklist.map((c) => (
                  <div
                    key={c.id}
                    className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                      c.ok
                        ? 'bg-emerald-500/8 border-emerald-400/30 text-emerald-800 dark:text-emerald-200'
                        : 'bg-rose-500/8 border-rose-400/25 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {c.ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      )}
                      <span className="truncate font-medium">{c.label}</span>
                    </span>
                    <strong className="tabular-nums shrink-0">{c.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

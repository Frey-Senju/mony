'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  Globe2,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Star,
  Trash2,
  Target,
  BellRing,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { fmtBrl, fmtPct, type ValuerAsset, type WatchlistEntry } from './ValuerTypes'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface MarketIndex {
  id: string
  symbol: string
  label: string
  unit: string
  group: string
  price: number
  change_pct: number
  live: boolean
}

interface MarketsResponse {
  updated_at: string
  macro: {
    cdi_annual_pct: number
    ipca_annual_pct: number
    real_interest_pct: number
    monthly_100k_cdi_gross: number
    monthly_100k_real: number
  }
  indices: MarketIndex[]
  briefing: {
    portfolio_count: number
    top_gainers: Array<{ ticker: string; name: string; price: number; change_pct: number }>
    top_losers: Array<{ ticker: string; name: string; price: number; change_pct: number }>
    below_ceiling_holdings: Array<{
      ticker: string
      name: string
      price: number
      consensus_price: number | null
      margin_of_safety_pct: number
      dy_12m: number
    }>
    top_market_bargains: Array<{
      ticker: string
      name: string
      asset_class: string
      price: number
      consensus_price: number | null
      margin_of_safety_pct: number
      dy_12m: number
      score: number
    }>
  }
}

function fmtIndexPrice(idx: MarketIndex): string {
  if (idx.unit === 'pts') {
    return `${Math.round(idx.price).toLocaleString('pt-BR')} pts`
  }
  if (idx.unit === 'US$') {
    return `US$ ${idx.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return fmtBrl(idx.price)
}

export function MarketsBriefingPanel({
  token,
  onOpenDossier,
}: {
  token?: string
  onOpenDossier: (ticker: string) => void
}) {
  const [data, setData] = useState<MarketsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/valuer/markets`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  const handleAIBriefing = () => {
    if (!data) return
    const idxStr = data.indices
      .slice(0, 6)
      .map((i) => `${i.label}: ${fmtIndexPrice(i)} (${fmtPct(i.change_pct, true)})`)
      .join(' | ')
    const bargains = data.briefing.top_market_bargains
      .slice(0, 3)
      .map((b) => `${b.ticker} (${fmtBrl(b.price)}, margem ${fmtPct(b.margin_of_safety_pct, true)}, DY ${fmtPct(b.dy_12m)})`)
      .join(', ')
    const prompt = `Gere um Briefing Executivo do Dia objetivo para minha carteira:\nMacro Brasil: CDI ${data.macro.cdi_annual_pct}% a.a., IPCA ${data.macro.ipca_annual_pct}%, Juro Real ${data.macro.real_interest_pct}%.\nMercados: ${idxStr}.\nMaiores descontos no Radar Valuer: ${bargains}.\nMe diga 3 ações práticas para hoje considerando renda fixa vs ações/FIIs.`
    navigator.clipboard?.writeText(prompt).catch(() => undefined)
    window.dispatchEvent(new CustomEvent('mony:open-ai', { detail: { tab: 'chat', prompt } }))
    dispatchToast('Briefing do Dia enviado para a Mony IA!', 'success')
  }

  if (loading && !data) {
    return <div className="h-80 glass-panel animate-pulse" />
  }
  if (!data) return null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="glass-panel p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm"
            style={{ background: 'var(--accent)' }}
          >
            <Globe2 className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Markets &amp; Briefing do Dia
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Índices globais, câmbio, juros reais (BCB) e oportunidades ao vivo conectadas à sua carteira
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="liquid-btn liquid-btn-glass px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={handleAIBriefing}
            className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Briefing Executivo IA
          </button>
        </div>
      </div>

      {/* Macro Brazil Thermometer (BCB) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Selic / CDI (a.a.)</p>
          <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
            {data.macro.cdi_annual_pct.toFixed(2).replace('.', ',')}%
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Referência renda fixa pós-fixada</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-500">IPCA Acumulado 12m</p>
          <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
            {data.macro.ipca_annual_pct.toFixed(2).replace('.', ',')}%
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Inflação oficial (BCB)</p>
        </div>
        <div className="glass-card p-4 border-emerald-400/35 bg-emerald-500/5">
          <p className="text-[11px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
            Juro Real Implícito
          </p>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
            IPCA + {data.macro.real_interest_pct.toFixed(2).replace('.', ',')}%
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Ganho acima da inflação</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-500">R$ 100k no CDI hoje</p>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
            {fmtBrl(data.macro.monthly_100k_cdi_gross)}/mês
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Real acima da inflação: <strong>{fmtBrl(data.macro.monthly_100k_real)}/mês</strong>
          </p>
        </div>
      </div>

      {/* Global Indices & FX Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {data.indices.map((idx) => {
          const up = idx.change_pct >= 0
          return (
            <div key={idx.id} className="glass-card p-4 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-semibold">{idx.label}</span>
                <span className="px-1.5 py-0.5 rounded-md bg-white/60 dark:bg-white/10 text-[10px]">
                  {idx.group}
                </span>
              </div>
              <p className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
                {fmtIndexPrice(idx)}
              </p>
              <p
                className={`text-xs font-bold inline-flex items-center gap-1 tabular-nums ${
                  up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {fmtPct(idx.change_pct, true)}
              </p>
            </div>
          )
        })}
      </div>

      {/* Portfolio Today + Top Market Bargains */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-panel p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            🎯 Sua Carteira Abaixo do Preço Teto ({data.briefing.below_ceiling_holdings.length})
          </h3>
          {data.briefing.below_ceiling_holdings.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
              {data.briefing.portfolio_count === 0
                ? 'Cadastre seus ativos em Investimentos para acompanhar aqui quais estão em ponto de compra hoje.'
                : 'Nenhum ativo da sua carteira está abaixo do Preço Teto de consenso hoje.'}
            </p>
          ) : (
            <div className="space-y-2">
              {data.briefing.below_ceiling_holdings.map((h) => (
                <button
                  key={h.ticker}
                  type="button"
                  onClick={() => onOpenDossier(h.ticker)}
                  className="w-full glass-card p-3 flex items-center justify-between gap-2 text-left hover:scale-[1.01] transition"
                >
                  <div>
                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                      {h.ticker} <span className="font-normal text-slate-500">· {h.name}</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Cotação {fmtBrl(h.price)} · Teto {fmtBrl(h.consensus_price)} · DY {fmtPct(h.dy_12m)}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 tabular-nums shrink-0">
                    {fmtPct(h.margin_of_safety_pct, true)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            🔥 Top 5 Barganhas da B3 Hoje (Radar Valuer)
          </h3>
          <div className="space-y-2">
            {data.briefing.top_market_bargains.map((b) => (
              <button
                key={b.ticker}
                type="button"
                onClick={() => onOpenDossier(b.ticker)}
                className="w-full glass-card p-3 flex items-center justify-between gap-2 text-left hover:scale-[1.01] transition"
              >
                <div>
                  <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {b.ticker} <span className="font-normal text-slate-500">· {b.name}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {fmtBrl(b.price)} vs Teto {fmtBrl(b.consensus_price)} · DY {fmtPct(b.dy_12m)} · Score {b.score}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 tabular-nums shrink-0">
                  {fmtPct(b.margin_of_safety_pct, true)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function WatchlistPanel({
  watchlist,
  universeByTicker,
  onAdd,
  onUpdateTarget,
  onRemove,
  onOpenDossier,
}: {
  watchlist: WatchlistEntry[]
  universeByTicker: Record<string, ValuerAsset>
  onAdd: (ticker: string, targetPrice: number, name?: string) => void
  onUpdateTarget: (ticker: string, nextTarget: number) => void
  onRemove: (ticker: string) => void
  onOpenDossier: (ticker: string) => void
}) {
  const [newTicker, setNewTicker] = useState('')
  const [newTarget, setNewTarget] = useState('')

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const tk = newTicker.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    const tgt = Number(newTarget.replace(',', '.'))
    if (!tk || !Number.isFinite(tgt) || tgt <= 0) {
      dispatchToast('Informe um ticker válido e o preço alvo.', 'error')
      return
    }
    const known = universeByTicker[tk]
    onAdd(tk, tgt, known?.name)
    setNewTicker('')
    setNewTarget('')
  }

  return (
    <div className="space-y-5">
      <div className="glass-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              Watchlist &amp; Alertas de Preço Teto
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Defina o preço máximo que aceita pagar — o Mony destaca imediatamente quando o ativo entra na zona de compra
            </p>
          </div>
        </div>

        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <input
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
            placeholder="Ticker (ex: BBAS3, HGLG11)"
            className="liquid-input text-xs uppercase"
            required
          />
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            placeholder="Seu Preço Teto Alvo (R$)"
            className="liquid-input text-xs tabular-nums"
            required
          />
          <button
            type="submit"
            className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Monitorar Ativo
          </button>
        </form>
      </div>

      {watchlist.length === 0 ? (
        <div className="glass-panel p-10 text-center space-y-2">
          <Target className="w-9 h-9 mx-auto text-slate-400" />
          <p className="text-sm font-bold text-slate-800 dark:text-white">Sua Watchlist está vazia</p>
          <p className="text-xs text-slate-500">
            Adicione ativos pelo formulário acima ou clique na estrela ⭐ em qualquer linha do Radar B3.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {watchlist.map((entry) => {
            const live = universeByTicker[entry.ticker]
            const price = live?.price ?? 0
            const hit = price > 0 && price <= entry.target_price
            const diffPct = price > 0 ? ((entry.target_price - price) / entry.target_price) * 100 : 0
            return (
              <div
                key={entry.ticker}
                className={`glass-card p-4 space-y-3 ${
                  hit ? 'border-emerald-400/60 bg-emerald-500/8' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenDossier(entry.ticker)}
                    className="text-left group"
                  >
                    <p className="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600">
                      {entry.ticker}
                    </p>
                    <p className="text-xs text-slate-500">{live?.name || entry.name}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(entry.ticker)}
                    aria-label={`Remover ${entry.ticker}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {hit && (
                  <div className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                    <BellRing className="w-3.5 h-3.5" />
                    🎯 Ponto de Compra Atingido! ({fmtPct(diffPct, true)} abaixo do alvo)
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-white/50 dark:bg-white/5">
                    <span className="text-[10px] text-slate-500 block">Cotação Atual</span>
                    <strong className="text-sm text-slate-900 dark:text-white tabular-nums">
                      {price > 0 ? fmtBrl(price) : 'Ver Dossiê'}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/50 dark:bg-white/5">
                    <span className="text-[10px] text-slate-500 block">Seu Preço Teto</span>
                    <input
                      type="number"
                      step="0.10"
                      value={entry.target_price}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        if (Number.isFinite(v) && v > 0) onUpdateTarget(entry.ticker, v)
                      }}
                      className="w-full bg-transparent text-sm font-extrabold text-blue-600 dark:text-blue-400 tabular-nums focus:outline-none"
                    />
                  </div>
                </div>

                {live && (
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-white/40 dark:border-white/10">
                    <span>Teto Valuer: <strong>{fmtBrl(live.consensus_price)}</strong></span>
                    <span>DY: <strong>{fmtPct(live.dy_12m)}</strong></span>
                    <span>Score: <strong>{live.score}</strong></span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

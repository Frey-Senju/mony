'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Radar,
  Swords,
  Globe2,
  Star,
  GraduationCap,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  Building2,
  Coins,
  Plus,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { useAuth } from '@/stores/auth/useAuth'
import { dispatchToast } from '@/components/ui/ToastProvider'
import {
  fmtBrl,
  fmtPct,
  verdictBadgeClasses,
  type ValuerAsset,
  type WatchlistEntry,
} from '@/components/valuer/ValuerTypes'
import { AssetDossierModal } from '@/components/valuer/AssetDossierModal'
import { MataMataPanel } from '@/components/valuer/MataMataPanel'
import { MarketsBriefingPanel, WatchlistPanel } from '@/components/valuer/MarketsAndWatchlistPanels'
import { MonyAcademyPanel } from '@/components/valuer/MonyAcademyPanel'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const WATCHLIST_KEY = 'mony_valuer_watchlist_v1'

type ValuerTab = 'radar' | 'matamata' | 'markets' | 'watchlist' | 'academy'
type RadarPreset = 'all' | 'barganha' | 'dividendos' | 'previdenciario' | 'fiis'

interface RadarPayload {
  preset: RadarPreset
  min_dy_bazin: number
  universe_count: number
  below_ceiling_count: number
  matched_count: number
  avg_dy_matched: number
  items: ValuerAsset[]
}

const RADAR_PRESETS: Array<{ id: RadarPreset; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'all', label: 'Todos (Ranking Geral)', desc: 'Top Score Fundamentalista', icon: Sparkles },
  { id: 'barganha', label: 'Radar de Barganha', desc: 'Desconto Graham & P/L baixo', icon: TrendingUp },
  { id: 'dividendos', label: 'Radar de Dividendos', desc: 'DY alto & Preço Teto Bazin', icon: Coins },
  { id: 'previdenciario', label: 'Previdenciário B.E.S.T.', desc: 'Bancos, Energia, Saneamento, Seguros', icon: ShieldCheck },
  { id: 'fiis', label: 'FIIs Descontados', desc: 'P/VP atrativo & renda mensal', icon: Building2 },
]

export default function MonyValuerPage() {
  return (
    <PrivateRoute>
      <MonyValuerContent />
    </PrivateRoute>
  )
}

function MonyValuerContent() {
  const { tokens } = useAuth()
  const token = tokens?.access_token

  const [activeTab, setActiveTab] = useState<ValuerTab>('radar')
  const [preset, setPreset] = useState<RadarPreset>('all')
  const [minDyBazin, setMinDyBazin] = useState(6.0)
  const [minDy, setMinDy] = useState('')
  const [maxPl, setMaxPl] = useState('')
  const [maxPvp, setMaxPvp] = useState('')
  const [minRoe, setMinRoe] = useState('')
  const [search, setSearch] = useState('')
  const [quickTicker, setQuickTicker] = useState('')

  const [radar, setRadar] = useState<RadarPayload | null>(null)
  const [allUniverse, setAllUniverse] = useState<ValuerAsset[]>([])
  const [loading, setLoading] = useState(true)

  const [dossierTicker, setDossierTicker] = useState<string | null>(null)
  const [compareTickers, setCompareTickers] = useState<string[]>(['BBAS3', 'ITUB4', 'TAEE11', 'BBSE3'])
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])

  // Load persisted watchlist
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY)
      if (raw) setWatchlist(JSON.parse(raw))
    } catch {
      // ignore
    }
  }, [])

  const saveWatchlist = useCallback((next: WatchlistEntry[]) => {
    setWatchlist(next)
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    document.title = 'Mony Valuer · Preço Teto, Radar B3 & Mata-Mata'
  }, [])

  const loadRadar = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        preset,
        min_dy_bazin: String(minDyBazin),
      })
      if (minDy) qs.set('min_dy', minDy)
      if (maxPl) qs.set('max_pl', maxPl)
      if (maxPvp) qs.set('max_pvp', maxPvp)
      if (minRoe) qs.set('min_roe', minRoe)
      if (search.trim()) qs.set('search', search.trim())

      const res = await fetch(`${API_URL}/valuer/radar?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const d: RadarPayload = await res.json()
        setRadar(d)
        if (preset === 'all' && !minDy && !maxPl && !maxPvp && !minRoe && !search.trim()) {
          setAllUniverse(d.items)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [token, preset, minDyBazin, minDy, maxPl, maxPvp, minRoe, search])

  useEffect(() => {
    const t = setTimeout(loadRadar, 150)
    return () => clearTimeout(t)
  }, [loadRadar])

  const universeByTicker = useMemo(() => {
    const map: Record<string, ValuerAsset> = {}
    for (const item of allUniverse.length > 0 ? allUniverse : radar?.items || []) {
      map[item.ticker] = item
    }
    return map
  }, [allUniverse, radar?.items])

  const watchlistHits = useMemo(() => {
    return watchlist.filter((w) => {
      const live = universeByTicker[w.ticker]
      return live && live.price > 0 && live.price <= w.target_price
    }).length
  }, [watchlist, universeByTicker])

  const addToWatchlist = (ticker: string, targetPrice: number, name?: string) => {
    const tk = ticker.toUpperCase()
    if (watchlist.some((w) => w.ticker === tk)) {
      dispatchToast(`${tk} já está na sua Watchlist.`, 'info')
      return
    }
    saveWatchlist([
      {
        ticker: tk,
        name: name || tk,
        target_price: Number(targetPrice.toFixed(2)),
        added_at: new Date().toISOString(),
      },
      ...watchlist,
    ])
    dispatchToast(`⭐ ${tk} adicionado à Watchlist (alvo ${fmtBrl(targetPrice)})!`, 'success')
  }

  const addAssetToWatchlist = (asset: ValuerAsset) => {
    const suggested = asset.consensus_price || asset.bazin_price || asset.price * 0.95
    addToWatchlist(asset.ticker, suggested, asset.name)
  }

  const addToCompare = (ticker: string) => {
    setCompareTickers((prev) => {
      if (prev.includes(ticker) || prev.length >= 12) return prev
      return [...prev, ticker]
    })
  }

  const handleQuickLookup = (e: React.FormEvent) => {
    e.preventDefault()
    const tk = quickTicker.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!tk) return
    setDossierTicker(tk)
    setQuickTicker('')
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Flagship Header */}
      <header className="glass-panel p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0"
              style={{ background: 'var(--accent)' }}
            >
              <Radar className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Mony Valuer · B3
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30">
                  Bazin · Graham · Gordon · Análise Técnica
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Preço Teto automático, 4 Radares de Oportunidades B3, Mata-Mata até 12 ativos, Markets &amp; Mony Academy
              </p>
            </div>
          </div>

          {/* Quick Ticker Dossier Search */}
          <form onSubmit={handleQuickLookup} className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={quickTicker}
                onChange={(e) => setQuickTicker(e.target.value.toUpperCase())}
                placeholder="Raio-X de qualquer ticker (ex: PETR4)"
                className="liquid-input pl-9 pr-3 py-2 text-xs w-64 uppercase"
              />
            </div>
            <button
              type="submit"
              className="liquid-btn liquid-btn-primary px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0"
            >
              Analisar
            </button>
          </form>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/40 dark:border-white/10" role="tablist">
          {(
            [
              { id: 'radar', label: 'Radar B3 & Preço Teto', icon: Radar },
              { id: 'matamata', label: `Mata-Mata (${compareTickers.length})`, icon: Swords },
              { id: 'markets', label: 'Markets & Briefing', icon: Globe2 },
              { id: 'watchlist', label: 'Watchlist & Alertas', icon: Star, badge: watchlistHits },
              { id: 'academy', label: 'Mony Academy', icon: GraduationCap },
            ] as const
          ).map((t) => {
            const Icon = t.icon
            const active = activeTab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(t.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                  active ? 'liquid-nav-active shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {'badge' in t && t.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white">
                    {t.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      {/* TAB 1: B3 RADAR & VALUATION */}
      {activeTab === 'radar' && (
        <div className="space-y-5">
          {/* 5 Preset Strategy Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {RADAR_PRESETS.map((p) => {
              const Icon = p.icon
              const active = preset === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={`glass-card p-3.5 text-left transition hover:scale-[1.01] ${
                    active ? 'ring-2 ring-blue-500 bg-blue-500/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900 dark:text-white">
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`} />
                    <span className="truncate">{p.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{p.desc}</p>
                </button>
              )
            })}
          </div>

          {/* Filter Toolbar + Bazin DY Target */}
          <div className="glass-panel p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-500" />
                Filtros Fundamentalistas &amp; Preço Teto Bazin
              </span>
              {radar && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                    {radar.below_ceiling_count} abaixo do Teto
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/60 dark:bg-white/10 text-slate-700 dark:text-slate-200 font-semibold">
                    {radar.matched_count} ativo(s) · DY médio {fmtPct(radar.avg_dy_matched)}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar ticker/setor..."
                className="liquid-input py-1.5 text-xs"
              />
              <label className="flex items-center gap-1.5 liquid-input py-1.5 px-2.5">
                <span className="text-[11px] text-slate-500 shrink-0">Bazin DY:</span>
                <select
                  value={minDyBazin}
                  onChange={(e) => setMinDyBazin(Number(e.target.value))}
                  className="bg-transparent font-bold w-full focus:outline-none"
                >
                  {[6, 7, 8, 9, 10, 12].map((v) => (
                    <option key={v} value={v}>
                      {v}% a.a.
                    </option>
                  ))}
                </select>
              </label>
              <input
                type="number"
                step="0.5"
                value={minDy}
                onChange={(e) => setMinDy(e.target.value)}
                placeholder="DY mín (%)"
                className="liquid-input py-1.5 text-xs tabular-nums"
              />
              <input
                type="number"
                step="1"
                value={maxPl}
                onChange={(e) => setMaxPl(e.target.value)}
                placeholder="P/L máx (ex: 12)"
                className="liquid-input py-1.5 text-xs tabular-nums"
              />
              <input
                type="number"
                step="0.1"
                value={maxPvp}
                onChange={(e) => setMaxPvp(e.target.value)}
                placeholder="P/VP máx (ex: 1.5)"
                className="liquid-input py-1.5 text-xs tabular-nums"
              />
              <input
                type="number"
                step="1"
                value={minRoe}
                onChange={(e) => setMinRoe(e.target.value)}
                placeholder="ROE mín (%)"
                className="liquid-input py-1.5 text-xs tabular-nums"
              />
            </div>
          </div>

          {/* Ranked Valuation Table */}
          {loading && !radar ? (
            <div className="h-96 glass-panel animate-pulse" />
          ) : (
            <div className="glass-panel overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200/70 dark:border-white/10 text-slate-500 dark:text-slate-400">
                    <th className="p-3 text-left">Ativo / Setor</th>
                    <th className="p-3 text-right">Cotação</th>
                    <th className="p-3 text-right">Bazin ({minDyBazin}%)</th>
                    <th className="p-3 text-right">Graham / VPA</th>
                    <th className="p-3 text-right">Consenso</th>
                    <th className="p-3 text-center">Margem / Status</th>
                    <th className="p-3 text-right">DY 12m</th>
                    <th className="p-3 text-right">P/L · P/VP</th>
                    <th className="p-3 text-right">ROE</th>
                    <th className="p-3 text-center">Score</th>
                    <th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                  {(radar?.items || []).map((a) => {
                    const inWatch = watchlist.some((w) => w.ticker === a.ticker)
                    const inCmp = compareTickers.includes(a.ticker)
                    return (
                      <tr key={a.ticker} className="hover:bg-white/45 dark:hover:bg-white/5 transition">
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => setDossierTicker(a.ticker)}
                            className="text-left group"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                {a.ticker}
                              </span>
                              {a.in_portfolio && (
                                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300">
                                  Na Carteira
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate max-w-[170px]">
                              {a.name} · {a.sector}
                            </p>
                          </button>
                        </td>
                        <td className="p-3 text-right font-bold tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                          {fmtBrl(a.price)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">
                          {fmtBrl(a.bazin_price)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">
                          {fmtBrl(a.graham_price)}
                        </td>
                        <td className="p-3 text-right font-extrabold tabular-nums text-blue-700 dark:text-blue-300 whitespace-nowrap">
                          {fmtBrl(a.consensus_price)}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${verdictBadgeClasses(a.verdict)}`}>
                            {fmtPct(a.margin_of_safety_pct, true)} · {a.verdict_label}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {fmtPct(a.dy_12m)}
                        </td>
                        <td className="p-3 text-right tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {a.pe_ratio ? `${a.pe_ratio.toFixed(1)}x` : '—'} · {a.pvp_ratio ? a.pvp_ratio.toFixed(2) : '—'}
                        </td>
                        <td className="p-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                          {fmtPct(a.roe)}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-flex items-center justify-center w-9 h-7 rounded-xl font-extrabold tabular-nums ${
                              a.score >= 80
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                : a.score >= 65
                                ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                                : 'bg-slate-200/70 dark:bg-white/10 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {a.score}
                          </span>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => addAssetToWatchlist(a)}
                              title="Monitorar na Watchlist"
                              aria-label={`Watchlist ${a.ticker}`}
                              className={`p-1.5 rounded-lg transition ${
                                inWatch
                                  ? 'text-amber-500 bg-amber-500/15'
                                  : 'text-slate-400 hover:text-amber-500 hover:bg-white/60 dark:hover:bg-white/10'
                              }`}
                            >
                              <Star className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                addToCompare(a.ticker)
                                dispatchToast(`${a.ticker} adicionado ao Mata-Mata!`, 'info')
                              }}
                              title="Adicionar ao Mata-Mata"
                              aria-label={`Comparar ${a.ticker}`}
                              className={`p-1.5 rounded-lg transition ${
                                inCmp
                                  ? 'text-blue-600 bg-blue-500/15'
                                  : 'text-slate-400 hover:text-blue-600 hover:bg-white/60 dark:hover:bg-white/10'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MATA-MATA */}
      {activeTab === 'matamata' && (
        <MataMataPanel
          token={token}
          tickers={compareTickers}
          onChangeTickers={setCompareTickers}
          minDyBazin={minDyBazin}
          onOpenDossier={(tk) => setDossierTicker(tk)}
        />
      )}

      {/* TAB 3: MARKETS & BRIEFING */}
      {activeTab === 'markets' && (
        <MarketsBriefingPanel token={token} onOpenDossier={(tk) => setDossierTicker(tk)} />
      )}

      {/* TAB 4: WATCHLIST */}
      {activeTab === 'watchlist' && (
        <WatchlistPanel
          watchlist={watchlist}
          universeByTicker={universeByTicker}
          onAdd={addToWatchlist}
          onUpdateTarget={(tk, nextTarget) =>
            saveWatchlist(watchlist.map((w) => (w.ticker === tk ? { ...w, target_price: nextTarget } : w)))
          }
          onRemove={(tk) => saveWatchlist(watchlist.filter((w) => w.ticker !== tk))}
          onOpenDossier={(tk) => setDossierTicker(tk)}
        />
      )}

      {/* TAB 5: MONY ACADEMY */}
      {activeTab === 'academy' && (
        <MonyAcademyPanel
          onJumpTab={(tab, nextPreset) => {
            if (nextPreset) setPreset(nextPreset as RadarPreset)
            setActiveTab(tab)
          }}
        />
      )}

      {/* Universal Asset Dossier & Technical Analysis Modal */}
      <AssetDossierModal
        ticker={dossierTicker}
        token={token}
        onClose={() => setDossierTicker(null)}
        onAddWatchlist={addAssetToWatchlist}
        onAddCompare={addToCompare}
      />
    </div>
  )
}

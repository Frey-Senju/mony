'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Trophy, Plus, X, Sparkles, Swords, CheckCircle2, XCircle } from 'lucide-react'
import { fmtBrl, fmtPct, verdictBadgeClasses, type ValuerAsset } from './ValuerTypes'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface CompareResponse {
  count: number
  champion_ticker: string
  champion_name: string
  champion_score: number
  champion_trophies: number
  row_winners: Record<string, string | null>
  assets: ValuerAsset[]
}

const MATCHUP_PRESETS: Array<{ label: string; tickers: string[] }> = [
  { label: 'Bancos B.E.S.T.', tickers: ['BBAS3', 'ITUB4', 'BBDC4', 'SANB11'] },
  { label: 'Energia Elétrica', tickers: ['TAEE11', 'EGIE3', 'CMIG4', 'CPLE6', 'ISAE4'] },
  { label: 'FIIs Logística', tickers: ['HGLG11', 'BTLG11', 'XPLG11', 'LVBI11'] },
  { label: 'FIIs Papel', tickers: ['MXRF11', 'KNCR11', 'KNIP11', 'CPTS11'] },
  { label: 'Seguros & Saneamento', tickers: ['BBSE3', 'CXSE3', 'SAPR11', 'SBSP3'] },
]

export function MataMataPanel({
  token,
  tickers,
  onChangeTickers,
  minDyBazin,
  onOpenDossier,
}: {
  token?: string
  tickers: string[]
  onChangeTickers: (next: string[]) => void
  minDyBazin: number
  onOpenDossier: (ticker: string) => void
}) {
  const [inputTicker, setInputTicker] = useState('')
  const [data, setData] = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!token || tickers.length < 2) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        tickers: tickers.join(','),
        min_dy_bazin: String(minDyBazin),
      })
      const res = await fetch(`${API_URL}/valuer/compare?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [token, tickers, minDyBazin])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = inputTicker.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!clean) return
    if (tickers.includes(clean)) {
      dispatchToast(`${clean} já está no Mata-Mata.`, 'info')
      return
    }
    if (tickers.length >= 12) {
      dispatchToast('Limite máximo de 12 ativos no Mata-Mata.', 'error')
      return
    }
    onChangeTickers([...tickers, clean])
    setInputTicker('')
  }

  const handleAskAI = () => {
    if (!data) return
    const rows = data.assets
      .map(
        (a) =>
          `${a.ticker}: Cotação ${fmtBrl(a.price)}, Teto ${fmtBrl(a.consensus_price)} (${fmtPct(a.margin_of_safety_pct, true)}), DY ${fmtPct(a.dy_12m)}, P/L ${a.pe_ratio ?? '—'}, P/VP ${a.pvp_ratio ?? '—'}, ROE ${fmtPct(a.roe)}, Score ${a.score}/100`
      )
      .join('\n')
    const prompt = `Faça um veredito executivo deste Mata-Mata de ativos da B3 e diga qual escolher para renda passiva de longo prazo:\n${rows}`
    navigator.clipboard?.writeText(prompt).catch(() => undefined)
    window.dispatchEvent(new CustomEvent('mony:open-ai', { detail: { tab: 'chat', prompt } }))
    dispatchToast('Tabela do Mata-Mata enviada para a Mony IA!', 'success')
  }

  const metricRows: Array<{
    key: string
    label: string
    render: (a: ValuerAsset) => string
    isGood?: (a: ValuerAsset) => boolean
  }> = [
    { key: 'price', label: 'Cotação Atual', render: (a) => fmtBrl(a.price) },
    { key: 'bazin_price', label: `Preço Teto Bazin (${minDyBazin}%)`, render: (a) => fmtBrl(a.bazin_price) },
    { key: 'graham_price', label: 'Preço Justo Graham / VPA', render: (a) => fmtBrl(a.graham_price) },
    { key: 'gordon_price', label: 'Modelo Gordon (DDM)', render: (a) => fmtBrl(a.gordon_price) },
    { key: 'consensus_price', label: 'Consenso Valuer', render: (a) => fmtBrl(a.consensus_price) },
    {
      key: 'margin_of_safety_pct',
      label: 'Margem de Segurança',
      render: (a) => fmtPct(a.margin_of_safety_pct, true),
      isGood: (a) => a.margin_of_safety_pct >= 10,
    },
    {
      key: 'dy_12m',
      label: 'Dividend Yield (12m)',
      render: (a) => fmtPct(a.dy_12m),
      isGood: (a) => a.dy_12m >= (a.asset_class === 'fii' ? 8 : 6),
    },
    {
      key: 'pe_ratio',
      label: 'P/L',
      render: (a) => (a.pe_ratio ? `${a.pe_ratio.toFixed(1)}x` : '—'),
      isGood: (a) => a.asset_class === 'fii' || (Boolean(a.pe_ratio) && (a.pe_ratio || 99) <= 12),
    },
    {
      key: 'pvp_ratio',
      label: 'P/VP',
      render: (a) => (a.pvp_ratio ? a.pvp_ratio.toFixed(2) : '—'),
      isGood: (a) => Boolean(a.pvp_ratio) && (a.pvp_ratio || 99) <= (a.asset_class === 'fii' ? 1.0 : 2.0),
    },
    {
      key: 'roe',
      label: 'ROE',
      render: (a) => fmtPct(a.roe),
      isGood: (a) => a.roe >= (a.asset_class === 'fii' ? 8 : 15),
    },
    {
      key: 'net_margin',
      label: 'Margem Líquida',
      render: (a) => fmtPct(a.net_margin),
      isGood: (a) => a.net_margin >= 15,
    },
    {
      key: 'net_debt_ebitda',
      label: 'Dív. Líq / EBITDA',
      render: (a) => `${a.net_debt_ebitda.toFixed(1)}x`,
      isGood: (a) => a.net_debt_ebitda <= 2.5,
    },
    {
      key: 'div_streak',
      label: 'Anos Pagando Dividendos',
      render: (a) => `${a.div_streak} anos`,
      isGood: (a) => a.div_streak >= 5,
    },
    {
      key: 'score',
      label: 'Mony Score (0–100)',
      render: (a) => `${a.score}/100`,
      isGood: (a) => a.score >= 70,
    },
  ]

  return (
    <div className="space-y-5">
      {/* Controls & Presets */}
      <div className="glass-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Swords className="w-5 h-5 text-blue-500" />
              Mata-Mata de Ativos (até 12 lado a lado)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Compare múltiplos, Preço Teto e checklist fundamentalista — cada linha destaca o vencedor com 🏆
            </p>
          </div>
          {data && (
            <button
              type="button"
              onClick={handleAskAI}
              className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Veredito Mony IA
            </button>
          )}
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase text-slate-500">Duelos prontos:</span>
          {MATCHUP_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChangeTickers(p.tickers)}
              className="liquid-btn liquid-btn-glass px-3 py-1 rounded-full text-xs font-semibold"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Selected Ticker Chips + Add Input */}
        <div className="flex flex-wrap items-center gap-2">
          {tickers.map((tk) => (
            <span
              key={tk}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-400/30"
            >
              <button type="button" onClick={() => onOpenDossier(tk)} className="hover:underline">
                {tk}
              </button>
              {tickers.length > 2 && (
                <button
                  type="button"
                  onClick={() => onChangeTickers(tickers.filter((x) => x !== tk))}
                  aria-label={`Remover ${tk}`}
                  className="hover:text-rose-500"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}

          {tickers.length < 12 && (
            <form onSubmit={handleAdd} className="inline-flex items-center gap-1.5">
              <input
                type="text"
                value={inputTicker}
                onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
                placeholder="+ Ticker (ex: WEGE3)"
                maxLength={10}
                className="liquid-input py-1 px-3 text-xs w-36 uppercase"
              />
              <button
                type="submit"
                className="liquid-btn liquid-btn-glass p-1.5 rounded-xl"
                aria-label="Adicionar ativo ao Mata-Mata"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Champion Highlight */}
      {data && (
        <div className="glass-panel p-4 border border-amber-400/45 bg-gradient-to-r from-amber-500/12 via-emerald-500/8 to-transparent flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <Trophy className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Campeão do Mata-Mata
              </p>
              <p className="text-base font-extrabold text-slate-900 dark:text-white">
                {data.champion_ticker} · {data.champion_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-200 font-bold">
              🏆 {data.champion_trophies} vitória(s) nos critérios
            </span>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 font-bold">
              Score {data.champion_score}/100
            </span>
          </div>
        </div>
      )}

      {/* Side-by-Side Comparison Matrix */}
      {loading && !data ? (
        <div className="h-72 glass-panel animate-pulse" />
      ) : data ? (
        <div className="glass-panel overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200/70 dark:border-white/10">
                <th className="p-3 text-left font-bold text-slate-600 dark:text-slate-300 sticky left-0 bg-white/80 dark:bg-slate-900/85 backdrop-blur-md min-w-[175px]">
                  Indicador / Critério
                </th>
                {data.assets.map((a) => (
                  <th key={a.ticker} className="p-3 text-center min-w-[125px]">
                    <button
                      type="button"
                      onClick={() => onOpenDossier(a.ticker)}
                      className="group flex flex-col items-center gap-1 mx-auto"
                    >
                      <span className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 inline-flex items-center gap-1">
                        {a.ticker === data.champion_ticker && <Trophy className="w-3.5 h-3.5 text-amber-500" />}
                        {a.ticker}
                      </span>
                      <span className="text-[10px] font-normal text-slate-500 truncate max-w-[115px]">{a.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${verdictBadgeClasses(a.verdict)}`}>
                        {a.verdict_label}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
              {metricRows.map((row) => {
                const winner = data.row_winners[row.key]
                return (
                  <tr key={row.key} className="hover:bg-white/40 dark:hover:bg-white/5 transition">
                    <td className="p-3 font-semibold text-slate-700 dark:text-slate-200 sticky left-0 bg-white/75 dark:bg-slate-900/80 backdrop-blur-md">
                      {row.label}
                    </td>
                    {data.assets.map((a) => {
                      const isWinner = winner === a.ticker
                      const good = row.isGood ? row.isGood(a) : undefined
                      return (
                        <td
                          key={a.ticker}
                          className={`p-3 text-center tabular-nums font-semibold ${
                            isWinner
                              ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-extrabold'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <span className="inline-flex items-center justify-center gap-1">
                            {good === true && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                            {good === false && <XCircle className="w-3 h-3 text-rose-400 shrink-0" />}
                            {row.render(a)}
                            {isWinner && <span title="Melhor da linha">🏆</span>}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {/* Checklist Score Row */}
              <tr className="bg-slate-100/60 dark:bg-white/5 font-bold">
                <td className="p-3 text-slate-800 dark:text-white sticky left-0 bg-slate-100/90 dark:bg-slate-900/90">
                  Critérios Aprovados
                </td>
                {data.assets.map((a) => (
                  <td key={a.ticker} className="p-3 text-center tabular-nums text-slate-900 dark:text-white">
                    {a.checklist_passed}/{a.checklist_total}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

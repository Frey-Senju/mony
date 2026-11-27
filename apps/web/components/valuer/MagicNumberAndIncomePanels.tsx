'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Snowflake, Target, Sparkles, CheckCircle2, Coins, PiggyBank } from 'lucide-react'
import { fmtBrl, fmtPct } from './ValuerTypes'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface MagicItem {
  ticker: string
  name: string
  asset_class: string
  sector: string
  price: number
  monthly_div_per_share: number
  dy_12m: number
  magic_shares: number
  magic_cost: number
  owned_shares: number
  remaining_shares: number
  remaining_cost: number
  progress_pct: number
  current_monthly_income: number
  months_to_magic: number | null
  in_portfolio: boolean
  reached: boolean
}

interface MagicPayload {
  monthly_contribution: number
  portfolio_items_count: number
  reached_count: number
  items: MagicItem[]
}

export function MagicNumberPanel({
  token,
  onOpenDossier,
}: {
  token?: string
  onOpenDossier: (ticker: string) => void
}) {
  const [contribution, setContribution] = useState('1000')
  const [onlyPortfolio, setOnlyPortfolio] = useState(false)
  const [data, setData] = useState<MagicPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const amt = Math.max(0, Number(contribution) || 0)
      const res = await fetch(`${API_URL}/valuer/magic-number?monthly_contribution=${amt}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [token, contribution])

  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
  }, [load])

  const items = (data?.items || []).filter((i) => !onlyPortfolio || i.in_portfolio)

  return (
    <div className="space-y-5">
      <div className="glass-panel p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <Snowflake className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Bola de Neve · Número Mágico (Magic Number)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Quantas cotas você precisa para os próprios dividendos comprarem <strong>+1 cota nova grátis todo mês</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-1.5 liquid-input py-1.5 px-3 text-xs">
            <span className="text-slate-500">Aporte/mês:</span>
            <input
              type="number"
              min={0}
              step={100}
              value={contribution}
              onChange={(e) => setContribution(e.target.value)}
              className="w-24 bg-transparent font-bold tabular-nums focus:outline-none"
            />
          </label>
          {data && data.portfolio_items_count > 0 && (
            <button
              type="button"
              onClick={() => setOnlyPortfolio((v) => !v)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                onlyPortfolio
                  ? 'liquid-btn-primary border-transparent'
                  : 'bg-white/50 dark:bg-white/10 border-white/60 dark:border-white/15 text-slate-700 dark:text-slate-200'
              }`}
            >
              {onlyPortfolio ? `Mostrando sua carteira (${data.portfolio_items_count})` : 'Filtrar só minha carteira'}
            </button>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="h-72 glass-panel animate-pulse" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.ticker}
              className={`glass-card p-4 space-y-3 ${
                item.reached
                  ? 'border-emerald-400/55 bg-emerald-500/8'
                  : item.in_portfolio
                  ? 'border-blue-400/40'
                  : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenDossier(item.ticker)}
                  className="text-left group"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600">
                      {item.ticker}
                    </span>
                    {item.in_portfolio && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300">
                        Na Carteira
                      </span>
                    )}
                    {item.reached && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" /> Bola de Neve!
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate max-w-[200px]">
                    {item.name} · {fmtBrl(item.price)}
                  </p>
                </button>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 tabular-nums">
                  DY {fmtPct(item.dy_12m)}
                </span>
              </div>

              {/* Magic Number Highlight */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-white/55 dark:bg-white/5">
                  <span className="text-[10px] text-slate-500 block">Número Mágico</span>
                  <strong className="text-sm text-slate-900 dark:text-white tabular-nums">
                    {item.magic_shares.toLocaleString('pt-BR')} cotas
                  </strong>
                  <span className="block text-[10px] text-slate-500 tabular-nums">
                    ({fmtBrl(item.magic_cost)})
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/55 dark:bg-white/5">
                  <span className="text-[10px] text-slate-500 block">Dividendo / cota mês</span>
                  <strong className="text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {fmtBrl(item.monthly_div_per_share)}
                  </strong>
                  <span className="block text-[10px] text-slate-500 tabular-nums">
                    {item.months_to_magic === 0
                      ? 'Meta atingida!'
                      : item.months_to_magic
                      ? `~${item.months_to_magic} meses aportando`
                      : 'Informe um aporte'}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                  <span>
                    Você tem: <strong>{item.owned_shares}</strong> / {item.magic_shares}
                  </span>
                  <strong>{item.progress_pct.toFixed(1)}%</strong>
                </div>
                <div className="h-2 rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, item.progress_pct)}%`,
                      background: item.reached ? '#10b981' : 'var(--accent)',
                    }}
                  />
                </div>
                {!item.reached && (
                  <p className="text-[10px] text-slate-500 tabular-nums">
                    Faltam <strong>{item.remaining_shares}</strong> cotas ({fmtBrl(item.remaining_cost)}) para auto-reinvestimento.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface IncomeAllocation {
  ticker: string
  name: string
  bucket: string
  sector: string
  price: number
  dy_12m: number
  shares: number
  capital: number
  monthly_income: number
  score: number
}

interface IncomeBuilderPayload {
  target_monthly_income: number
  required_capital: number
  estimated_monthly_income: number
  estimated_annual_income: number
  blended_yield_pct: number
  weights: { stocks_pct: number; fiis_pct: number; fixed_pct: number }
  allocations: IncomeAllocation[]
}

export function IncomeBuilderPanel({
  token,
  onOpenDossier,
}: {
  token?: string
  onOpenDossier: (ticker: string) => void
}) {
  const [targetMonthly, setTargetMonthly] = useState(3000)
  const [stocksPct, setStocksPct] = useState(40)
  const [fiisPct, setFiisPct] = useState(40)
  const [fixedPct, setFixedPct] = useState(20)
  const [data, setData] = useState<IncomeBuilderPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        target_monthly_income: String(targetMonthly),
        stocks_pct: String(stocksPct),
        fiis_pct: String(fiisPct),
        fixed_pct: String(fixedPct),
      })
      const res = await fetch(`${API_URL}/valuer/income-builder?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [token, targetMonthly, stocksPct, fiisPct, fixedPct])

  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
  }, [load])

  return (
    <div className="space-y-5">
      <div className="glass-panel p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <PiggyBank className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Montador de Carteira Previdenciária
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Informe a renda passiva mensal desejada — o Mony monta o mix diversificado com os melhores ativos do Radar Valuer
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[1000, 3000, 5000, 10000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setTargetMonthly(v)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold transition ${
                  targetMonthly === v
                    ? 'liquid-btn-primary'
                    : 'bg-white/55 dark:bg-white/10 text-slate-700 dark:text-slate-200'
                }`}
              >
                {fmtBrl(v)}/mês
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <label className="space-y-1.5 glass-card p-3.5">
            <div className="flex justify-between">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Renda Mensal Alvo</span>
              <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtBrl(targetMonthly)}</strong>
            </div>
            <input
              type="range"
              min={500}
              max={25000}
              step={250}
              value={targetMonthly}
              onChange={(e) => setTargetMonthly(Number(e.target.value))}
              className="w-full accent-emerald-600"
            />
          </label>
          <label className="space-y-1.5 glass-card p-3.5">
            <div className="flex justify-between">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Ações B.E.S.T.</span>
              <strong className="tabular-nums">{stocksPct}%</strong>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={stocksPct}
              onChange={(e) => setStocksPct(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </label>
          <label className="space-y-1.5 glass-card p-3.5">
            <div className="flex justify-between">
              <span className="font-semibold text-slate-600 dark:text-slate-300">FIIs IFIX</span>
              <strong className="tabular-nums">{fiisPct}%</strong>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={fiisPct}
              onChange={(e) => setFiisPct(Number(e.target.value))}
              className="w-full accent-violet-600"
            />
          </label>
          <label className="space-y-1.5 glass-card p-3.5">
            <div className="flex justify-between">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Renda Fixa (IPCA+/CDI)</span>
              <strong className="tabular-nums">{fixedPct}%</strong>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={fixedPct}
              onChange={(e) => setFixedPct(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
          </label>
        </div>

        {/* Summary KPIs */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="glass-card p-4 border-blue-400/35 bg-blue-500/5">
              <p className="text-[11px] font-semibold uppercase text-slate-500 flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-blue-500" /> Patrimônio Necessário Hoje
              </p>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums money-value">
                {fmtBrl(data.required_capital)}
              </p>
            </div>
            <div className="glass-card p-4 border-emerald-400/35 bg-emerald-500/5">
              <p className="text-[11px] font-semibold uppercase text-slate-500 flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-emerald-500" /> Renda Mensal Estimada
              </p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums money-value">
                {fmtBrl(data.estimated_monthly_income)}/mês
              </p>
              <p className="text-[11px] text-slate-500">{fmtBrl(data.estimated_annual_income)}/ano</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-[11px] font-semibold uppercase text-slate-500 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-violet-500" /> Yield Médio Ponderado
              </p>
              <p className="text-2xl font-extrabold text-violet-600 dark:text-violet-400 mt-1 tabular-nums">
                {fmtPct(data.blended_yield_pct)} a.a.
              </p>
              <p className="text-[11px] text-slate-500">
                Mix: {data.weights.stocks_pct}% Ações · {data.weights.fiis_pct}% FIIs · {data.weights.fixed_pct}% RF
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Detailed Allocations Table */}
      {loading && !data ? (
        <div className="h-64 glass-panel animate-pulse" />
      ) : data ? (
        <div className="glass-panel overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200/70 dark:border-white/10 text-slate-500">
                <th className="p-3 text-left">Ativo Sugerido</th>
                <th className="p-3 text-left">Classe / Setor</th>
                <th className="p-3 text-right">Cotação</th>
                <th className="p-3 text-right">DY / Taxa</th>
                <th className="p-3 text-right">Qtd Cotas</th>
                <th className="p-3 text-right">Capital Alocado</th>
                <th className="p-3 text-right">Renda Mensal Est.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
              {data.allocations.map((row) => (
                <tr key={row.ticker} className="hover:bg-white/40 dark:hover:bg-white/5">
                  <td className="p-3">
                    {row.ticker !== 'TESOURO-IPCA+' ? (
                      <button
                        type="button"
                        onClick={() => onOpenDossier(row.ticker)}
                        className="text-left group"
                      >
                        <strong className="text-sm text-slate-900 dark:text-white group-hover:text-blue-600">
                          {row.ticker}
                        </strong>
                        <span className="block text-[11px] text-slate-500">{row.name}</span>
                      </button>
                    ) : (
                      <div>
                        <strong className="text-sm text-slate-900 dark:text-white">{row.ticker}</strong>
                        <span className="block text-[11px] text-slate-500">{row.name}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">{row.bucket}</span> · {row.sector}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {row.ticker === 'TESOURO-IPCA+' ? '—' : fmtBrl(row.price)}
                  </td>
                  <td className="p-3 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {fmtPct(row.dy_12m)}
                  </td>
                  <td className="p-3 text-right font-bold tabular-nums">
                    {row.ticker === 'TESOURO-IPCA+' ? '—' : row.shares.toLocaleString('pt-BR')}
                  </td>
                  <td className="p-3 text-right font-bold tabular-nums money-value text-slate-900 dark:text-white">
                    {fmtBrl(row.capital)}
                  </td>
                  <td className="p-3 text-right font-extrabold tabular-nums money-value text-emerald-600 dark:text-emerald-400">
                    +{fmtBrl(row.monthly_income)}/mês
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  CalendarClock,
  RotateCcw,
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ForecastEvent {
  title: string
  amount: number
  type: 'income' | 'expense'
  source: 'recurring' | 'card_bill' | 'scheduled'
}

interface DailyPoint {
  date: string
  label: string
  balance: number
  delta: number
  income: number
  expense: number
  events: ForecastEvent[]
}

interface ForecastResponse {
  days: number
  start_date: string
  end_date: string
  starting_balance: number
  ending_balance: number
  lowest_balance: number
  lowest_balance_date: string
  negative_days_count: number
  first_negative_date: string | null
  total_projected_income: number
  total_projected_expenses: number
  liquid_accounts_count: number
  daily_points: DailyPoint[]
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

function fmtBrDate(iso: string): string {
  if (!iso || iso.length < 10) return iso
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

const SOURCE_BADGE: Record<ForecastEvent['source'], string> = {
  recurring: 'Recorrente',
  card_bill: 'Fatura Cartão',
  scheduled: 'Agendado',
}

export function DailyCashflowForecastPanel({ token }: { token?: string }) {
  const [days, setDays] = useState<30 | 60 | 90>(60)
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // What-If Simulator ("E se eu gastar/receber R$ X no dia Y?")
  const [simType, setSimType] = useState<'expense' | 'income'>('expense')
  const [simAmount, setSimAmount] = useState('')
  const [simDate, setSimDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 10)
    return d.toISOString().slice(0, 10)
  })
  const [simLabel, setSimLabel] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/reports/daily-forecast?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setForecast(await res.json())
      }
    } finally {
      setLoading(false)
    }
  }, [token, days])

  useEffect(() => {
    load()
  }, [load])

  const parsedSimAmt = Math.max(0, Number(simAmount.replace(',', '.')) || 0)
  const hasSim = parsedSimAmt > 0 && Boolean(simDate)

  const chartPoints = useMemo(() => {
    if (!forecast) return []
    const signedSim = simType === 'income' ? parsedSimAmt : -parsedSimAmt
    return forecast.daily_points.map((pt) => ({
      ...pt,
      simulated_balance: hasSim
        ? Number((pt.balance + (pt.date >= simDate ? signedSim : 0)).toFixed(2))
        : undefined,
    }))
  }, [forecast, hasSim, parsedSimAmt, simDate, simType])

  const simStats = useMemo(() => {
    if (!hasSim || chartPoints.length === 0) return null
    let lowest = Infinity
    let lowestDate = chartPoints[0].date
    let firstNeg: string | null = null
    for (const pt of chartPoints) {
      const v = pt.simulated_balance ?? pt.balance
      if (v < lowest) {
        lowest = v
        lowestDate = pt.date
      }
      if (v < 0 && !firstNeg) firstNeg = pt.date
    }
    return {
      lowest,
      lowestDate,
      firstNeg,
      ending: chartPoints[chartPoints.length - 1].simulated_balance ?? forecast?.ending_balance ?? 0,
    }
  }, [hasSim, chartPoints, forecast?.ending_balance])

  const eventDays = useMemo(() => {
    if (!forecast) return []
    return forecast.daily_points.filter((p) => p.events.length > 0).slice(0, 12)
  }, [forecast])

  return (
    <section className="glass-panel p-5 sm:p-6 space-y-5" aria-label="Previsão de Saldo Diário">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <Activity className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Previsão de Saldo Diário &amp; Vale de Caixa
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Projeção dia a dia somando contas líquidas + recorrências + vencimentos de faturas + lançamentos futuros
            </p>
          </div>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-white/55 dark:bg-white/10 border border-white/60 dark:border-white/15 self-start sm:self-auto">
          {([30, 60, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                days === d ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-64 glass-card animate-pulse" />
      ) : !forecast ? (
        <div className="glass-card p-6 text-center text-sm text-slate-500">
          Não foi possível carregar a previsão diária.
        </div>
      ) : (
        <>
          {/* 4 Forecast KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="glass-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Saldo Líquido Hoje
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums money-value">
                {brl(forecast.starting_balance)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {forecast.liquid_accounts_count} conta(s) líquida(s)
              </p>
            </div>

            <div
              className={`glass-card p-4 ${
                forecast.lowest_balance < 0 ? 'border-rose-400/60 bg-rose-500/5' : ''
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Menor Saldo (Vale)
              </p>
              <p
                className={`text-xl font-bold mt-1 tabular-nums money-value ${
                  forecast.lowest_balance < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {brl(forecast.lowest_balance)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Em {fmtBrDate(forecast.lowest_balance_date)}
              </p>
            </div>

            <div className="glass-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Saldo ao Fim de {days}d
              </p>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums money-value">
                {brl(forecast.ending_balance)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                +{brl(forecast.total_projected_income)} / -{brl(forecast.total_projected_expenses)}
              </p>
            </div>

            <div className="glass-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Saúde do Período
              </p>
              {forecast.negative_days_count > 0 ? (
                <>
                  <p className="text-base font-bold text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {forecast.negative_days_count} dia(s) no vermelho
                  </p>
                  <p className="text-[11px] text-rose-600/80 dark:text-rose-300/80 mt-0.5">
                    Primeiro alerta: {fmtBrDate(forecast.first_negative_date || '')}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Caixa 100% positivo
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Sem risco de cheque especial nos próximos {days} dias
                  </p>
                </>
              )}
            </div>
          </div>

          {/* What-If Simulator Bar */}
          <div className="glass-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                <Sparkles className="w-4 h-4 text-violet-500" />
                Simulador Instantâneo: &ldquo;E se eu fizer este lançamento?&rdquo;
              </span>
              {hasSim && (
                <button
                  type="button"
                  onClick={() => {
                    setSimAmount('')
                    setSimLabel('')
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Limpar simulação
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <select
                value={simType}
                onChange={(e) => setSimType(e.target.value as 'expense' | 'income')}
                className="liquid-input text-xs"
                aria-label="Tipo da simulação"
              >
                <option value="expense">💸 E se eu gastar...</option>
                <option value="income">💰 E se eu receber...</option>
              </select>
              <input
                type="number"
                min="0"
                step="10"
                value={simAmount}
                onChange={(e) => setSimAmount(e.target.value)}
                placeholder="Valor (ex.: 1500)"
                className="liquid-input text-xs tabular-nums"
                aria-label="Valor hipotético"
              />
              <input
                type="date"
                value={simDate}
                min={forecast.start_date}
                max={forecast.end_date}
                onChange={(e) => setSimDate(e.target.value)}
                className="liquid-input text-xs"
                aria-label="Data hipotética"
              />
              <input
                type="text"
                value={simLabel}
                onChange={(e) => setSimLabel(e.target.value)}
                placeholder="Motivo (ex.: Notebook, Bônus)"
                className="liquid-input text-xs"
                aria-label="Descrição hipotética"
              />
            </div>

            {simStats && (
              <div
                className={`p-3 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 border ${
                  simStats.lowest < 0
                    ? 'bg-rose-500/10 border-rose-400/40 text-rose-700 dark:text-rose-300'
                    : 'bg-emerald-500/10 border-emerald-400/40 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                <span>
                  {simStats.lowest < 0 ? (
                    <>
                      <strong>Atenção:</strong> com {simLabel || 'este lançamento'} de {brl(parsedSimAmt)} em{' '}
                      {fmtBrDate(simDate)}, seu caixa ficaria negativo a partir de{' '}
                      <strong>{fmtBrDate(simStats.firstNeg || simStats.lowestDate)}</strong> (vale de{' '}
                      <strong className="money-value">{brl(simStats.lowest)}</strong>).
                    </>
                  ) : (
                    <>
                      <strong>Cabe no bolso!</strong> Mesmo com {simLabel || 'este lançamento'} de{' '}
                      {brl(parsedSimAmt)} em {fmtBrDate(simDate)}, seu menor saldo fica em{' '}
                      <strong className="money-value">{brl(simStats.lowest)}</strong> ({fmtBrDate(simStats.lowestDate)}).
                    </>
                  )}
                </span>
                <span className="font-semibold tabular-nums money-value">
                  Saldo final simulado: {brl(simStats.ending)}
                </span>
              </div>
            )}
          </div>

          {/* Area Chart */}
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartPoints} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="monyForecastGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0071E3" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0071E3" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  interval={Math.max(1, Math.floor(chartPoints.length / 10))}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '16px',
                    border: '1px solid rgba(255,255,255,0.45)',
                    background: 'rgba(15, 23, 42, 0.9)',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                  formatter={(value: unknown, name?: string | number) => [
                    brl(Number(value || 0)),
                    String(name) === 'simulated_balance' ? 'Cenário Simulado' : 'Saldo Projetado',
                  ]}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as DailyPoint | undefined
                    if (!row) return String(label)
                    const evCount = row.events?.length || 0
                    return `${fmtBrDate(row.date)}${evCount > 0 ? ` · ${evCount} evento(s)` : ''}`
                  }}
                />
                <ReferenceLine y={0} stroke="#f43f5e" strokeDasharray="4 4" strokeWidth={1.5} />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#0071E3"
                  strokeWidth={2.5}
                  fill="url(#monyForecastGrad)"
                />
                {hasSim && (
                  <Line
                    type="monotone"
                    dataKey="simulated_balance"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    dot={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Upcoming Major Events Strip */}
          {eventDays.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" />
                Próximas Movimentações Projetadas
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {eventDays.map((day) => (
                  <div key={day.date} className="glass-card p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {fmtBrDate(day.date)}
                      </span>
                      <span
                        className={`font-semibold tabular-nums money-value ${
                          day.balance < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Saldo: {brl(day.balance)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {day.events.slice(0, 3).map((ev, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate text-slate-600 dark:text-slate-300">
                            <span className="opacity-65 mr-1">[{SOURCE_BADGE[ev.source]}]</span>
                            {ev.title}
                          </span>
                          <span
                            className={`font-semibold shrink-0 tabular-nums money-value ${
                              ev.type === 'income'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {ev.type === 'income' ? '+' : '-'}
                            {brl(ev.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  Repeat,
  Coins,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { useAuth } from '@/stores/auth/useAuth'
import { useAppearance } from '@/app/_theme/provider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const PT_MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

interface CalendarEvent {
  kind: 'recurring' | 'card_due' | 'debt' | 'dividend' | 'transaction'
  title: string
  category: string
  amount: number
  direction: 'in' | 'out'
  source: string
}

interface CalendarDay {
  date: string
  day: number
  weekday: number
  is_today: boolean
  total_in: number
  total_out: number
  events: CalendarEvent[]
}

interface CurvePoint {
  date: string
  label: string
  balance: number
  delta: number
  events_count: number
}

interface ProjectionPayload {
  year: number
  month: number
  days: number
  current_liquid_balance: number
  projected_end_balance: number
  min_projected_balance: number
  min_projected_date: string
  first_negative_date?: string | null
  alerts: Array<{ severity: string; date: string; min_balance: number; message: string }>
  daily_curve: CurvePoint[]
  calendar_days: CalendarDay[]
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function CalendarPage() {
  return (
    <PrivateRoute>
      <CalendarContent />
    </PrivateRoute>
  )
}

function CalendarContent() {
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const { chartPalette } = useAppearance()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [daysHorizon, setDaysHorizon] = useState(90)
  const [data, setData] = useState<ProjectionPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(
        `${API_URL}/calendar/projection?days=${daysHorizon}&year=${year}&month=${month}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        const json: ProjectionPayload = await res.json()
        setData(json)
        const todayCell = json.calendar_days.find((d) => d.is_today) || json.calendar_days[0] || null
        setSelectedDay(todayCell)
      }
    } finally {
      setLoading(false)
    }
  }, [token, daysHorizon, year, month])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const shiftMonth = (delta: number) => {
    let m = month + delta
    let y = year
    if (m < 1) {
      m = 12
      y -= 1
    } else if (m > 12) {
      m = 1
      y += 1
    }
    setYear(y)
    setMonth(m)
  }

  const firstWeekdayOffset = data?.calendar_days?.[0]?.weekday ?? 0

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <header className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ background: 'var(--accent)' }}
            aria-hidden="true"
          >
            <CalendarIcon className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Calendário Financeiro &amp; Projeção {daysHorizon} Dias
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              Vencimentos de faturas, contas fixas, parcelas, dívidas e dividendos B3 com alerta de caixa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDaysHorizon(d)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                daysHorizon === d ? 'liquid-nav-active' : 'liquid-btn liquid-btn-glass'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </header>

      {/* Alerts */}
      {data?.alerts.map((a, idx) => (
        <div
          key={idx}
          role="alert"
          className="glass-card p-4 border-rose-500/60 bg-rose-50/70 dark:bg-rose-950/35 flex items-start gap-3 text-sm text-rose-800 dark:text-rose-200"
        >
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" aria-hidden="true" />
          <span>{a.message}</span>
        </div>
      ))}

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-card p-5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
              Saldo Líquido Atual
            </p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 money-value">
              {brl(data.current_liquid_balance)}
            </p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
              Menor Saldo Previsto ({data.min_projected_date})
            </p>
            <p
              className={`text-2xl font-bold mt-1 money-value ${
                data.min_projected_balance < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {brl(data.min_projected_balance)}
            </p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
              Saldo Projetado em {daysHorizon} dias
            </p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1 money-value">
              {brl(data.projected_end_balance)}
            </p>
          </div>
        </div>
      )}

      {/* 90-day Balance Projection Curve */}
      {data && (
        <section className="glass-card p-5 space-y-3" aria-label="Curva de saldo projetado">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Curva de Saldo Projetado ({daysHorizon} dias)
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily_curve} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={Math.max(2, Math.floor(daysHorizon / 12))} />
                <YAxis tickFormatter={(v) => `R$ ${(Number(v) / 1000).toFixed(1)}k`} tick={{ fontSize: 11 }} width={68} />
                <Tooltip formatter={(v) => brl(Number(v ?? 0))} />
                <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="4 4" />
                <Area
                  type="monotone"
                  dataKey="balance"
                  name="Saldo Projetado"
                  stroke={chartPalette[0]}
                  fill={chartPalette[0]}
                  fillOpacity={0.22}
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Interactive Monthly Calendar + Selected Day Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-8 glass-panel space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {PT_MONTHS[month - 1]} de {year}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Mês anterior"
                className="liquid-btn liquid-btn-glass p-2 rounded-xl"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Próximo mês"
                className="liquid-btn liquid-btn-glass p-2 rounded-xl"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">{w}</div>
            ))}
          </div>

          {loading || !data ? (
            <div className="h-72 animate-pulse bg-slate-200/50 dark:bg-white/5 rounded-2xl" />
          ) : (
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: firstWeekdayOffset }).map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[76px]" />
              ))}
              {data.calendar_days.map((d) => {
                const isSelected = selectedDay?.date === d.date
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setSelectedDay(d)}
                    className={`min-h-[76px] p-2 rounded-xl border text-left flex flex-col justify-between transition ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/12 ring-1 ring-blue-500/40'
                        : d.is_today
                        ? 'border-emerald-500/70 bg-emerald-500/10'
                        : 'border-slate-200/70 dark:border-white/10 hover:bg-white/50 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className={`text-xs font-bold ${d.is_today ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>
                      {d.day}
                    </span>
                    <div className="space-y-0.5 text-[10px] leading-tight">
                      {d.total_in > 0 && (
                        <p className="text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                          +{brl(d.total_in)}
                        </p>
                      )}
                      {d.total_out > 0 && (
                        <p className="text-rose-600 dark:text-rose-400 font-semibold truncate">
                          -{brl(d.total_out)}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* Day Events Drawer */}
        <aside className="lg:col-span-4 glass-panel space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Agenda do Dia
            </p>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
              {selectedDay ? selectedDay.date.split('-').reverse().join('/') : 'Selecione um dia'}
            </h3>
          </div>

          {!selectedDay || selectedDay.events.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              Nenhum vencimento ou lançamento previsto para este dia.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {selectedDay.events.map((ev, i) => (
                <li key={i} className="glass-card p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {ev.kind === 'card_due' ? (
                      <CreditCard className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
                    ) : ev.kind === 'dividend' ? (
                      <Coins className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
                    ) : (
                      <Repeat className="w-4 h-4 text-blue-500 shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{ev.title}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{ev.category}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold shrink-0 money-value ${
                      ev.direction === 'in'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {ev.direction === 'in' ? '+' : '-'} {brl(ev.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}

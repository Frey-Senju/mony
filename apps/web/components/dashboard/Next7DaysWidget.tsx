'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar, CreditCard, Repeat, Coins, ChevronRight } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface UpcomingEvent {
  date: string
  kind: string
  title: string
  category: string
  amount: number
  direction: 'in' | 'out'
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

export function Next7DaysWidget({ token, refreshKey = 0 }: { token?: string; refreshKey?: number }) {
  const [events, setEvents] = useState<UpcomingEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    const now = new Date()
    fetch(
      `${API_URL}/calendar/projection?days=7&year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!active || !body?.calendar_days) return
        const todayIso = now.toISOString().slice(0, 10)
        const limitDate = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)
        const list: UpcomingEvent[] = []
        for (const day of body.calendar_days) {
          if (day.date >= todayIso && day.date <= limitDate && Array.isArray(day.events)) {
            for (const ev of day.events) {
              list.push({ date: day.date, ...ev })
            }
          }
        }
        setEvents(list.slice(0, 6))
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token, refreshKey])

  if (loading && events.length === 0) {
    return <div className="glass-card h-24 animate-pulse" aria-busy="true" />
  }

  const totalOut = events.filter((e) => e.direction === 'out').reduce((s, e) => s + Number(e.amount || 0), 0)
  const totalIn = events.filter((e) => e.direction === 'in').reduce((s, e) => s + Number(e.amount || 0), 0)

  return (
    <section className="glass-card p-5 space-y-3" aria-label="Próximos 7 dias">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-500" aria-hidden="true" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Próximos 7 Dias ({events.length} evento{events.length !== 1 ? 's' : ''})
          </h2>
          {totalOut > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 money-value">
              Saídas: {brl(totalOut)}
            </span>
          )}
          {totalIn > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 money-value">
              Entradas: {brl(totalIn)}
            </span>
          )}
        </div>
        <Link
          href="/dashboard/calendar"
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
        >
          Ver calendário completo
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Semana tranquila! Nenhum vencimento de fatura ou conta fixa previsto nos próximos 7 dias.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {events.map((ev, idx) => (
            <div
              key={`${ev.date}-${ev.title}-${idx}`}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/50 dark:bg-white/5 border border-white/60 dark:border-white/10 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                {ev.kind === 'card_due' ? (
                  <CreditCard className="w-3.5 h-3.5 text-rose-500 shrink-0" aria-hidden="true" />
                ) : ev.kind === 'dividend' ? (
                  <Coins className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-hidden="true" />
                ) : (
                  <Repeat className="w-3.5 h-3.5 text-blue-500 shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{ev.title}</p>
                  <p className="text-[10px] text-slate-500">
                    {ev.date.slice(8, 10)}/{ev.date.slice(5, 7)} · {ev.category}
                  </p>
                </div>
              </div>
              <span
                className={`font-bold tabular-nums shrink-0 money-value ${
                  ev.direction === 'in'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {ev.direction === 'in' ? '+' : '-'} {brl(ev.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

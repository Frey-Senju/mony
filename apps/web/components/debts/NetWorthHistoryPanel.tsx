'use client'

import React, { useEffect, useState } from 'react'
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
import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface HistoryPoint {
  ym: string
  label: string
  net_worth: number
  monthly_delta: number
  projected: boolean
}

interface NetWorthHistoryResponse {
  current_net_worth: number
  total_assets: number
  total_debts: number
  period_change: number
  period_change_pct: number
  avg_monthly_delta: number
  points: HistoryPoint[]
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

export function NetWorthHistoryPanel({ token }: { token?: string }) {
  const [data, setData] = useState<NetWorthHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    fetch(`${API_URL}/insights/net-worth-history?months=12`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setData(d)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  if (loading) {
    return <div className="h-64 glass-panel animate-pulse" />
  }
  if (!data || data.points.length === 0) return null

  const chartData = data.points.map((pt, idx, arr) => {
    const isLastReal = !pt.projected && (idx === arr.length - 1 || arr[idx + 1]?.projected)
    return {
      ...pt,
      real_nw: !pt.projected ? pt.net_worth : null,
      proj_nw: pt.projected || isLastReal ? pt.net_worth : null,
    }
  })

  const positive = data.period_change >= 0

  return (
    <section className="glass-panel p-5 sm:p-6 space-y-4" aria-label="Evolução Patrimonial 12 Meses">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            <Sparkles className="w-3.5 h-3.5" />
            Evolução Patrimonial · 12 Meses + Projeção 3M
          </span>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
            Trajetória do Patrimônio Líquido
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-bold tabular-nums money-value ${
              positive
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
            }`}
          >
            {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {positive ? '+' : ''}
            {brl(data.period_change)} ({positive ? '+' : ''}
            {data.period_change_pct.toFixed(1).replace('.', ',')}%)
          </span>
          <span className="px-3 py-1.5 rounded-full bg-white/55 dark:bg-white/10 text-slate-700 dark:text-slate-200 font-semibold tabular-nums money-value">
            Ritmo médio: {data.avg_monthly_delta >= 0 ? '+' : ''}
            {brl(data.avg_monthly_delta)}/mês
          </span>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="monyNwRealGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="monyNwProjGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.45)',
                background: 'rgba(15, 23, 42, 0.92)',
                color: '#f8fafc',
                fontSize: '12px',
              }}
              formatter={(value: unknown, name?: string | number) => [
                brl(Number(value || 0)),
                String(name) === 'proj_nw' ? 'Projeção Tendência' : 'Patrimônio Líquido',
              ]}
            />
            <ReferenceLine y={0} stroke="#f43f5e" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="real_nw"
              stroke="#10b981"
              strokeWidth={2.5}
              fill="url(#monyNwRealGrad)"
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="proj_nw"
              stroke="#8b5cf6"
              strokeWidth={2}
              strokeDasharray="6 4"
              fill="url(#monyNwProjGrad)"
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        * Meses marcados com asterisco representam projeção linear baseada na sua média líquida dos últimos 6 meses.
      </p>
    </section>
  )
}

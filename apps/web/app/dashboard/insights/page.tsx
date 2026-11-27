'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Star,
  Sparkles,
  HeartPulse,
  CheckCircle2,
  Repeat,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { TrendChart, formatMonthLabel, type MonthDataPoint } from '@/components/insights/TrendChart'
import { AnomalyAlert } from '@/components/insights/AnomalyAlert'
import { SpendingXRayAndReview } from '@/components/insights/SpendingXRayAndReview'
import { GamificationAndAchievements } from '@/components/insights/GamificationAndAchievements'
import { useInsights } from '@/hooks/useInsights'
import { useCategories } from '@/hooks/useCategories'
import { useAuth } from '@/stores/auth/useAuth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface HealthScoreData {
  period: string
  month_label: string
  score: number
  grade: string
  savings_rate_pct: number
  reserve_months: number
  net_worth: number
  income: number
  expenses: number
  pillars: Array<{ id: string; label: string; score: number; max: number }>
  review: {
    wins: string[]
    alerts: string[]
    action_plan: string[]
  }
}

interface SubscriptionItem {
  merchant: string
  months_active: number
  latest_amount: number
  previous_amount: number
  avg_monthly: number
  annualized_cost: number
  pct_change: number
  last_charge_date?: string | null
  has_price_hike: boolean
}

interface RadarData {
  subscriptions: SubscriptionItem[]
  count: number
  total_monthly: number
  total_annual: number
  price_hikes: SubscriptionItem[]
  price_hikes_count: number
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function InsightsPage() {
  return (
    <PrivateRoute>
      <InsightsContent />
    </PrivateRoute>
  )
}

function InsightsContent() {
  const auth = useAuth()
  const token = auth.tokens?.access_token
  const { insights, loading, error } = useInsights(token)
  const { categories: userCategories } = useCategories(token)
  const [chartData, setChartData] = useState<MonthDataPoint[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [health, setHealth] = useState<HealthScoreData | null>(null)
  const [radar, setRadar] = useState<RadarData | null>(null)

  useEffect(() => {
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }

    const loadAll = async () => {
      setChartLoading(true)
      const [hRes, rRes] = await Promise.all([
        fetch(`${API_URL}/insights/health-score`, { headers }).catch(() => null),
        fetch(`${API_URL}/insights/subscriptions-radar`, { headers }).catch(() => null),
      ])
      if (hRes?.ok) setHealth(await hRes.json())
      if (rRes?.ok) setRadar(await rRes.json())

      const today = new Date()
      const points: MonthDataPoint[] = []
      await Promise.all(
        Array.from({ length: 6 }, async (_, i) => {
          const d = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1)
          const year = d.getFullYear()
          const month = d.getMonth() + 1
          try {
            const res = await fetch(
              `${API_URL}/reports/monthly-summary?year=${year}&month=${month}`,
              { headers }
            )
            if (res.ok) {
              const data = await res.json()
              points.push({ label: formatMonthLabel(year, month), expenses: Number(data.total_expenses) })
            }
          } catch {
            // skip
          }
        })
      )
      setChartData(points)
      setChartLoading(false)
    }

    loadAll()
  }, [token])

  const trend = insights?.trend
  const TrendIcon =
    trend?.trend_direction === 'up' ? TrendingUp : trend?.trend_direction === 'down' ? TrendingDown : Minus

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Liquid Glass */}
      <header className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ background: 'var(--accent)' }}
            aria-hidden="true"
          >
            <HeartPulse className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Insights, Saúde Financeira &amp; Mony Review
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              Score 0–100, fechamento mensal inteligente, radar de assinaturas e anomalias
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/ai-review"
          className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold self-start sm:self-auto"
        >
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          Central Revisão IA
        </Link>
      </header>

      {error && (
        <div role="alert" className="glass-card p-4 border-rose-400/50 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* EPIC-015 Wave 3: Meu Desempenho, Nível, XP & 10 Conquistas */}
      <GamificationAndAchievements token={token} />

      {/* Score de Saúde Financeira (0-100) + Mony Review */}
      {health && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5" aria-label="Score de Saúde Financeira e Fechamento Mensal">
          {/* Score Card */}
          <div className="lg:col-span-5 glass-panel flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Mony Health Score · {health.month_label}
                </p>
                <div className="flex items-baseline gap-3 mt-2">
                  <span className="text-5xl font-extrabold text-slate-900 dark:text-white">
                    {health.score}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">/ 100</span>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-bold ${
                      health.score >= 80
                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                        : health.score >= 60
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                        : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    Nota {health.grade}
                  </span>
                </div>
              </div>
              <Sparkles className="w-6 h-6 text-violet-500 shrink-0" aria-hidden="true" />
            </div>

            <div className="space-y-2.5">
              {health.pillars.map((p) => {
                const pct = Math.round((p.score / p.max) * 100)
                return (
                  <div key={p.id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{p.label}</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {p.score}/{p.max}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Mony Review (Fechamento do Mês) */}
          <div className="lg:col-span-7 glass-panel space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Fechamento do Mês — Mony Review
              </h2>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/60 dark:bg-white/10 text-slate-700 dark:text-slate-200 money-value">
                Patrimônio Líquido: {brl(health.net_worth)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="glass-card p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Vitórias do Mês
                </p>
                {health.review.wins.length === 0 ? (
                  <p className="text-xs text-slate-500">Continue registrando seus lançamentos para gerar conquistas.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
                    {health.review.wins.map((w, idx) => (
                      <li key={idx}>• {w}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="glass-card p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  Pontos de Atenção
                </p>
                {health.review.alerts.length === 0 ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Nenhum alerta crítico neste mês!</p>
                ) : (
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
                    {health.review.alerts.map((a, idx) => (
                      <li key={idx}>• {a}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="glass-card p-4 border-violet-400/35 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                Plano de Ação (Próximos 3 Passos)
              </p>
              <ol className="space-y-1 text-xs text-slate-700 dark:text-slate-200 list-decimal list-inside">
                {health.review.action_plan.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      )}

      {/* Radar de Assinaturas & Vazamentos Silenciosos */}
      {radar && (
        <section className="glass-panel space-y-4" aria-label="Radar de assinaturas e reajustes silenciosos">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Repeat className="w-5 h-5 text-violet-500" aria-hidden="true" />
                Radar de Assinaturas &amp; Vazamentos Silenciosos
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Custo anualizado dos seus compromissos recorrentes + alerta automático de aumento de preço
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="glass-card px-3.5 py-2 text-right">
                <p className="text-[10px] uppercase font-semibold text-slate-500">Custo Anual</p>
                <p className="text-base font-bold text-rose-600 dark:text-rose-400 money-value">
                  {brl(radar.total_annual)}
                </p>
              </div>
              {radar.price_hikes_count > 0 && (
                <span className="px-3 py-1.5 rounded-xl bg-amber-100/90 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-bold">
                  {radar.price_hikes_count} reajuste(s) detectado(s)
                </span>
              )}
            </div>
          </div>

          {radar.subscriptions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
              Nenhuma assinatura recorrente detectada ainda. Conecte o Open Finance ou cadastre suas contas fixas.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {radar.subscriptions.slice(0, 9).map((sub) => (
                <div
                  key={sub.merchant}
                  className={`glass-card p-4 space-y-2 ${
                    sub.has_price_hike ? 'border-amber-400/70 dark:border-amber-500/50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {sub.merchant}
                    </p>
                    {sub.has_price_hike && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 shrink-0">
                        <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                        +{sub.pct_change.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Mensal: <strong className="text-slate-900 dark:text-white money-value">{brl(sub.latest_amount)}</strong>
                    </span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400 money-value">
                      {brl(sub.annualized_cost)}/ano
                    </span>
                  </div>
                  {sub.has_price_hike && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      Subiu de {brl(sub.previous_amount)} para {brl(sub.latest_amount)} no último ciclo.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Top Categorias & Tendência */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Star className="w-4 h-4 text-violet-500" aria-hidden="true" />
            Top Categorias deste mês
          </h2>
          {loading ? (
            <div className="h-32 animate-pulse bg-slate-200/50 dark:bg-white/5 rounded-xl" />
          ) : !insights || insights.top_categories.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma despesa registrada neste mês.</p>
          ) : (
            <ul className="space-y-2.5">
              {insights.top_categories.map((cat, i) => (
                <li key={cat.category} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {i + 1}. {cat.category}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300 money-value">
                      {brl(Number(cat.total))} ({Number(cat.percentage_of_expenses).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${Math.min(100, Number(cat.percentage_of_expenses))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-card p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TrendIcon className="w-4 h-4 text-blue-500" aria-hidden="true" />
            Tendência de Gastos
          </h2>
          {loading ? (
            <div className="h-32 animate-pulse bg-slate-200/50 dark:bg-white/5 rounded-xl" />
          ) : trend ? (
            <div className="space-y-2 text-sm">
              <p className="text-slate-700 dark:text-slate-200">
                Mês atual: <strong className="money-value">{brl(Number(trend.current_month_expenses))}</strong>
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                Mês anterior: <strong className="money-value">{brl(Number(trend.previous_month_expenses))}</strong>
              </p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Variação: {Number(trend.pct_change) > 0 ? '+' : ''}
                {Number(trend.pct_change).toFixed(1)}%
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sem histórico suficiente ainda.</p>
          )}

          {insights && (
            <div className="pt-2">
              <AnomalyAlert anomalies={insights.anomalies} />
            </div>
          )}
        </div>
      </div>

      {/* EPIC-008: Mony Review Wrapped, Merchant Ranking, Weekday Heatmap & Month Comparator */}
      <SpendingXRayAndReview token={token} categories={userCategories} />

      {/* Evolução 6 meses */}
      <section className="glass-card p-5 space-y-3">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Evolução de Despesas (Últimos 6 Meses)
        </h2>
        {chartLoading ? (
          <div className="h-48 animate-pulse bg-slate-200/50 dark:bg-white/5 rounded-xl" />
        ) : (
          <TrendChart data={chartData} />
        )}
      </section>
    </div>
  )
}

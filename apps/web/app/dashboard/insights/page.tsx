'use client'

import React, { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, BarChart2, AlertTriangle, Star } from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { InsightCard } from '@/components/insights/InsightCard'
import { TrendChart, formatMonthLabel, type MonthDataPoint } from '@/components/insights/TrendChart'
import { AnomalyAlert } from '@/components/insights/AnomalyAlert'
import { useInsights } from '@/hooks/useInsights'
import { useAuth } from '@/stores/auth/useAuth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function InsightsPage() {
  return (
    <PrivateRoute>
      <InsightsContent />
    </PrivateRoute>
  )
}

function InsightsContent() {
  const auth = useAuth()
  const { insights, loading, error } = useInsights(auth.tokens?.access_token)
  const [chartData, setChartData] = useState<MonthDataPoint[]>([])
  const [chartLoading, setChartLoading] = useState(false)

  useEffect(() => {
    if (!auth.tokens?.access_token) return
    const token = auth.tokens.access_token

    const fetchHistory = async () => {
      setChartLoading(true)
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
              { headers: { Authorization: `Bearer ${token}` } }
            )
            if (res.ok) {
              const data = await res.json()
              points.push({ label: formatMonthLabel(year, month), expenses: Number(data.total_expenses) })
            }
          } catch { /* skip failed months */ }
        })
      )

      setChartData(points.sort((a, b) => a.label.localeCompare(b.label)))
      setChartLoading(false)
    }

    fetchHistory()
  }, [auth.tokens?.access_token])

  const trend = insights?.trend
  const TrendIcon =
    trend?.trend_direction === 'up' ? TrendingUp :
    trend?.trend_direction === 'down' ? TrendingDown : Minus

  const trendColor =
    trend?.trend_direction === 'up' ? 'red' :
    trend?.trend_direction === 'down' ? 'green' : 'blue'

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Insights</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Padrões de gasto e análise automática do seu histórico financeiro
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Top Categorias */}
        <InsightCard title="Top Categorias este mês" icon={<Star className="w-4 h-4" />} color="purple" loading={loading}>
          {insights?.top_categories.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma despesa registrada este mês.</p>
          ) : (
            <ul className="space-y-2">
              {insights?.top_categories.map((cat, i) => (
                <li key={cat.category} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{cat.category}</span>
                      <span className="text-slate-600 dark:text-slate-400">
                        {Number(cat.percentage_of_expenses).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                      <div
                        className="bg-purple-500 h-1.5 rounded-full"
                        style={{ width: `${Math.min(Number(cat.percentage_of_expenses), 100)}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </InsightCard>

        {/* Tendência MoM */}
        <InsightCard
          title="Tendência Mensal"
          icon={<TrendIcon className="w-4 h-4" />}
          color={trendColor as 'red' | 'green' | 'blue'}
          loading={loading}
        >
          {trend && (
            <div className="space-y-1">
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {trend.pct_change > 0 ? '+' : ''}{Number(trend.pct_change).toFixed(1)}%
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {trend.trend_direction === 'up' && 'Gastos aumentaram vs mês anterior'}
                {trend.trend_direction === 'down' && 'Gastos reduziram vs mês anterior'}
                {trend.trend_direction === 'stable' && 'Gastos estáveis vs mês anterior'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                Mês atual: R$ {Number(trend.current_month_expenses).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                {' · '}
                Anterior: R$ {Number(trend.previous_month_expenses).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          )}
        </InsightCard>

        {/* Anomalias */}
        <InsightCard
          title={`Anomalias${insights && insights.anomalies.length > 0 ? ` (${insights.anomalies.length})` : ''}`}
          icon={<AlertTriangle className="w-4 h-4" />}
          color={insights && insights.anomalies.length > 0 ? 'red' : 'green'}
          loading={loading}
        >
          <AnomalyAlert anomalies={insights?.anomalies ?? []} />
        </InsightCard>

        {/* Gráfico histórico */}
        <InsightCard title="Despesas — últimos 6 meses" icon={<BarChart2 className="w-4 h-4" />} color="blue" loading={chartLoading}>
          <TrendChart data={chartData} />
        </InsightCard>
      </div>
    </div>
  )
}

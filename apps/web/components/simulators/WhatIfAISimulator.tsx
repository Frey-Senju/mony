'use client'

import React, { useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { Sparkles, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/stores/auth/useAuth'
import { useAppearance } from '@/app/_theme/provider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface WhatIfResult {
  headline: string
  verdict: 'viable' | 'caution' | 'risky'
  verdict_label: string
  baseline: {
    avg_monthly_income: number
    avg_monthly_expenses: number
    monthly_surplus: number
    starting_net_worth: number
    ending_net_worth: number
  }
  scenario: {
    monthly_impact: number
    new_monthly_surplus: number
    ending_net_worth: number
    wealth_delta: number
  }
  recommendation: string
  timeline: Array<{ month: number; label: string; baseline_wealth: number; scenario_wealth: number }>
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function WhatIfAISimulator() {
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const { chartPalette } = useAppearance()

  const [scenarioType, setScenarioType] = useState<'finance_purchase' | 'income_drop' | 'monthly_saving'>('finance_purchase')
  const [amount, setAmount] = useState(80000)
  const [monthlyDelta, setMonthlyDelta] = useState(1200)
  const [months, setMonths] = useState(48)
  const [annualRate, setAnnualRate] = useState(14.0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WhatIfResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/ai/what-if`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scenario_type: scenarioType,
          amount,
          monthly_delta: monthlyDelta,
          months,
          annual_rate_pct: annualRate,
        }),
      })
      if (!res.ok) throw new Error('Não foi possível simular o cenário')
      setResult(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na simulação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="glass-panel space-y-5" aria-label="Simulador E se com dados reais da Mony IA">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" aria-hidden="true" />
            Simulador &quot;E se...?&quot; com seus Dados Reais
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
            Cruza sua renda média real, despesas, contas, investimentos B3 e dívidas para testar decisões financeiras
          </p>
        </div>
      </div>

      <form onSubmit={handleRun} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div>
          <label htmlFor="whatif-type" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            Tipo de cenário
          </label>
          <select
            id="whatif-type"
            value={scenarioType}
            onChange={(e) => setScenarioType(e.target.value as typeof scenarioType)}
            className="input-base"
          >
            <option value="finance_purchase">Financiar bem (carro/imóvel)</option>
            <option value="monthly_saving">Aumentar aporte mensal</option>
            <option value="income_drop">Queda temporária de renda</option>
          </select>
        </div>

        {scenarioType === 'finance_purchase' ? (
          <div>
            <label htmlFor="whatif-amount" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Valor financiado (R$)
            </label>
            <input
              id="whatif-amount"
              type="number"
              min={1000}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="input-base"
            />
          </div>
        ) : (
          <div>
            <label htmlFor="whatif-delta" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              {scenarioType === 'monthly_saving' ? 'Aporte extra / mês (R$)' : 'Queda mensal (R$)'}
            </label>
            <input
              id="whatif-delta"
              type="number"
              min={100}
              step={100}
              value={monthlyDelta}
              onChange={(e) => setMonthlyDelta(Number(e.target.value))}
              className="input-base"
            />
          </div>
        )}

        <div>
          <label htmlFor="whatif-months" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            Prazo (meses)
          </label>
          <input
            id="whatif-months"
            type="number"
            min={6}
            max={360}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="input-base"
          />
        </div>

        <div>
          <label htmlFor="whatif-rate" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            Taxa anual (% a.a.)
          </label>
          <input
            id="whatif-rate"
            type="number"
            min={0}
            max={60}
            step={0.5}
            value={annualRate}
            onChange={(e) => setAnnualRate(Number(e.target.value))}
            className="input-base"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="liquid-btn liquid-btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Simular
        </button>
      </form>

      {error && (
        <div role="alert" className="glass-card p-3 border-rose-400/50 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4 pt-2">
          <div
            className={`glass-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border ${
              result.verdict === 'viable'
                ? 'border-emerald-400/60'
                : result.verdict === 'caution'
                ? 'border-amber-400/60'
                : 'border-rose-400/60'
            }`}
          >
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                {result.verdict === 'viable' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : result.verdict === 'caution' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-500" />
                )}
                Veredito Mony IA: {result.verdict_label}
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{result.headline}</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">{result.recommendation}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] text-slate-500">Diferença no Patrimônio</p>
              <p
                className={`text-xl font-bold money-value ${
                  result.scenario.wealth_delta >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {result.scenario.wealth_delta >= 0 ? '+' : ''}
                {brl(result.scenario.wealth_delta)}
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.timeline} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `R$ ${(Number(v) / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={68} />
                <Tooltip formatter={(v) => brl(Number(v ?? 0))} />
                <Legend />
                <Line type="monotone" dataKey="baseline_wealth" name="Trajetória Atual" stroke={chartPalette[0]} strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="scenario_wealth" name="Com Cenário" stroke={chartPalette[2]} strokeWidth={2.5} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  )
}

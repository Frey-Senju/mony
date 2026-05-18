'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { useAuth } from '@/stores/auth/useAuth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const MONTH_LABELS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface AnnualMonthItem {
  month: number
  income: number
  expenses: number
  net: number
}

interface AnnualSummary {
  year: number
  months: AnnualMonthItem[]
  totals: AnnualMonthItem
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
  return 0
}

function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function AnnualReportsPage() {
  return (
    <PrivateRoute>
      <AnnualContent />
    </PrivateRoute>
  )
}

function AnnualContent() {
  const auth = useAuth()
  const token = auth.tokens?.access_token

  const now = useMemo(() => new Date(), [])
  const [year, setYear] = useState(now.getFullYear())
  const [data, setData] = useState<AnnualSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAnnual = useCallback(async (y: number) => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`${API_URL}/reports/annual-summary?year=${y}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      const raw = await r.json()
      setData({
        year: raw.year,
        months: raw.months.map((m: any) => ({
          month: m.month,
          income: toNumber(m.income),
          expenses: toNumber(m.expenses),
          net: toNumber(m.net),
        })),
        totals: {
          month: 0,
          income: toNumber(raw.totals.income),
          expenses: toNumber(raw.totals.expenses),
          net: toNumber(raw.totals.net),
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar resumo anual')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchAnnual(year)
  }, [token, year, fetchAnnual])

  const chartData = (data?.months ?? []).map((m) => ({
    label: `${MONTH_LABELS_SHORT[m.month - 1]}/${String(year).slice(2)}`,
    Receitas: m.income,
    Despesas: m.expenses,
    Saldo: m.net,
  }))

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                Resumo Anual
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Visão consolidada dos 12 meses de {year}
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/dashboard/reports"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                ← Relatório Mensal
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Year selector */}
        <section className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Ano anterior"
          >
            ← Anterior
          </button>
          <span className="text-lg font-semibold text-slate-800 dark:text-slate-200 min-w-[4rem] text-center">
            {year}
          </span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Próximo ano"
          >
            Próximo →
          </button>
        </section>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
            Erro: {error}
          </div>
        )}

        {/* Line chart */}
        <section className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Despesas — últimos 12 meses de {year}
          </h2>
          {loading ? (
            <div className="h-64 animate-pulse bg-slate-100 dark:bg-slate-800 rounded" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => fmtBRL(Number(value))} />
                <Legend />
                <Line type="monotone" dataKey="Receitas" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Despesas" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Saldo" stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* Monthly table */}
        <section className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-3 text-slate-600 dark:text-slate-400 font-medium">Mês</th>
                <th className="text-right px-4 py-3 text-emerald-600 dark:text-emerald-400 font-medium">Receitas</th>
                <th className="text-right px-4 py-3 text-red-600 dark:text-red-400 font-medium">Despesas</th>
                <th className="text-right px-4 py-3 text-blue-600 dark:text-blue-400 font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 12 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : (data?.months ?? []).map((m) => (
                    <tr key={m.month} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">
                        {MONTH_LABELS_SHORT[m.month - 1]}/{year}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                        {fmtBRL(m.income)}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                        {fmtBRL(m.expenses)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${m.net >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                        {fmtBRL(m.net)}
                      </td>
                    </tr>
                  ))}
            </tbody>
            {data && !loading && (
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-800/50 font-semibold">
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">Total {year}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                    {fmtBRL(data.totals.income)}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                    {fmtBRL(data.totals.expenses)}
                  </td>
                  <td className={`px-4 py-3 text-right ${data.totals.net >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                    {fmtBRL(data.totals.net)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </section>
      </div>
    </div>
  )
}

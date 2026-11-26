'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import {
  TrendingUp,
  Clock,
  Shield,
  Flame,
  ChevronLeft,
  ChevronRight,
  Table2,
  PieChart as PieIcon,
  Pencil,
  X,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { useAuth } from '@/stores/auth/useAuth'
import { useCategories } from '@/hooks/useCategories'
import { AISuggestionsBanner } from '@/components/ai/AISuggestionsBanner'
import {
  UniversalEditTransactionModal,
  type EditableTransaction,
} from '@/components/transactions/UniversalEditTransactionModal'
import { EditableSpreadsheetTable } from '@/components/transactions/EditableSpreadsheetTable'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const STORAGE_KEY = 'mony_cashflow_prefs_v1'

interface CashflowMonth {
  month: number
  ym: string
  label: string
  short_label: string
  income: number
  expenses: number
  expense_ratio_pct: number
  net: number
  cumulative_net: number
  by_category: Record<string, number>
}

interface CashflowResponse {
  year: number
  categories: string[]
  months: CashflowMonth[]
  stats: {
    avg_income: number
    avg_expenses: number
    avg_net: number
    avg_expense_ratio_pct: number
    median_income: number
    median_expenses: number
    median_net: number
    median_expense_ratio_pct: number
    total_income: number
    total_expenses: number
    total_net: number
    total_expense_ratio_pct: number
    category_avg: Record<string, number>
    category_median: Record<string, number>
    category_total: Record<string, number>
    category_pct_of_median_income: Record<string, number>
    category_pct_of_total_income: Record<string, number>
  }
  current_reserve_balance: number
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

function pct(v: number): string {
  return `${(v || 0).toFixed(1).replace('.', ',')}%`
}

export default function CashflowPage() {
  return (
    <PrivateRoute>
      <CashflowContent />
    </PrivateRoute>
  )
}

function CashflowContent() {
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const { categories: userCategories, updateCategory, fetchCategories } = useCategories(token)

  const [year, setYear] = useState(() => new Date().getFullYear())
  const [data, setData] = useState<CashflowResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // Story 5.2: Month-by-Month Spreadsheet Drilldown & Universal Editing
  const [selectedYm, setSelectedYm] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [monthTxs, setMonthTxs] = useState<EditableTransaction[]>([])
  const [loadingMonthTxs, setLoadingMonthTxs] = useState(false)
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([])
  const [editingTx, setEditingTx] = useState<EditableTransaction | null>(null)

  // Editable spreadsheet KPIs persisted locally
  const [workHours, setWorkHours] = useState(220)
  const [baseSalary, setBaseSalary] = useState(5150)
  const [emergencyMonths, setEmergencyMonths] = useState(4)
  const [investPct, setInvestPct] = useState(30)
  const [customReserve, setCustomReserve] = useState<string>('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const p = JSON.parse(saved)
        if (p.workHours) setWorkHours(p.workHours)
        if (p.baseSalary) setBaseSalary(p.baseSalary)
        if (p.emergencyMonths) setEmergencyMonths(p.emergencyMonths)
        if (p.investPct) setInvestPct(p.investPct)
        if (p.customReserve !== undefined) setCustomReserve(p.customReserve)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ workHours, baseSalary, emergencyMonths, investPct, customReserve })
      )
    } catch {
      // ignore
    }
  }, [workHours, baseSalary, emergencyMonths, investPct, customReserve])

  const loadCashflow = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [cfRes, acctRes] = await Promise.all([
        fetch(`${API_URL}/reports/cashflow?year=${year}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      if (cfRes.ok) {
        setData(await cfRes.json())
      }
      if (acctRes.ok) {
        const list = await acctRes.json()
        setAccounts(Array.isArray(list) ? list : list.items || [])
      }
    } finally {
      setLoading(false)
    }
  }, [token, year])

  const loadMonthTransactions = useCallback(async () => {
    if (!token || !selectedYm) return
    setLoadingMonthTxs(true)
    try {
      // Fetch EVERY transaction of the selected competency month (paginates automatically if > 1000)
      const all: EditableTransaction[] = []
      let offset = 0
      const batchLimit = 1000
      let total = Infinity
      while (all.length < total) {
        const res = await fetch(
          `${API_URL}/transactions?statement_month=${encodeURIComponent(selectedYm)}&limit=${batchLimit}&offset=${offset}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!res.ok) break
        const body = await res.json()
        const chunk: EditableTransaction[] = Array.isArray(body) ? body : body.items || []
        total = typeof body?.total === 'number' ? body.total : chunk.length
        all.push(...chunk)
        if (chunk.length < batchLimit) break
        offset += chunk.length
      }
      setMonthTxs(all)
    } finally {
      setLoadingMonthTxs(false)
    }
  }, [token, selectedYm])

  useEffect(() => {
    loadMonthTransactions()
  }, [loadMonthTransactions])

  useEffect(() => {
    loadCashflow()
  }, [loadCashflow])

  useEffect(() => {
    const onRefresh = () => {
      loadCashflow()
      loadMonthTransactions()
    }
    window.addEventListener('mony:transactions-updated', onRefresh)
    return () => window.removeEventListener('mony:transactions-updated', onRefresh)
  }, [loadCashflow, loadMonthTransactions])

  const stats = data?.stats
  const realHourValue =
    workHours > 0 ? (stats?.median_income || 0) / workHours : 0
  const theoryHourValue = workHours > 0 ? baseSalary / workHours : 0

  // Emergency reserve & FI (exact spreadsheet formulas)
  const refMonthlyForReserve = (stats?.avg_income || 0) > 0 ? stats!.avg_income : baseSalary
  const emergencyTarget = emergencyMonths * refMonthlyForReserve
  const currentReserve =
    customReserve !== '' ? Math.max(0, Number(customReserve) || 0) : data?.current_reserve_balance || 0
  const reserveGap = Math.max(0, emergencyTarget - currentReserve)
  const monthlyInvestAmount = refMonthlyForReserve * (investPct / 100)
  const monthsToReserve =
    monthlyInvestAmount > 0 ? Math.ceil(reserveGap / monthlyInvestAmount) : 0
  const reserveProgressPct =
    emergencyTarget > 0 ? Math.min(100, Math.round((currentReserve / emergencyTarget) * 100)) : 0

  // Financial Independence = 200 * Median Monthly Expenses (0.5% a.m. passive withdrawal)
  const fiTarget = 200 * ((stats?.median_expenses || 0) > 0 ? stats!.median_expenses : stats?.avg_expenses || 0)

  // 60 / 30 / 10 Salary Rule (from Janeiro tab)
  const refIncomeRule = (stats?.median_income || 0) > 0 ? stats!.median_income : baseSalary
  const ruleEconomy10 = refIncomeRule * 0.1
  const ruleInvest30 = refIncomeRule * 0.3
  const ruleMaxSpend60 = refIncomeRule * 0.6
  const ruleEssential50 = refIncomeRule * 0.5
  const ruleFun10 = refIncomeRule * 0.1

  // Heatmap helper for category matrix
  const maxCatCell = data
    ? Math.max(
        1,
        ...data.months.flatMap((m) => Object.values(m.by_category || {}))
      )
    : 1

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header + Year Switcher */}
      <header className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Cashflow & Mapa Anual de Gastos
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Ganhos vs. Gastos mês a mês, matriz por categoria, valor da sua hora, reserva de emergência e independência financeira
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-white/55 dark:bg-white/10 border border-white/70 dark:border-white/15 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            aria-label="Ano anterior"
            className="p-2 rounded-xl hover:bg-white/70 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-4 text-base font-bold text-slate-900 dark:text-white tabular-nums">
            {year}
          </span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            aria-label="Próximo ano"
            className="p-2 rounded-xl hover:bg-white/70 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Strategic KPIs (Left column of Cashflow + Reserva de Emergência tab) */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Hour Value */}
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Valor da Minha Hora
            </span>
            <Clock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {brl(realHourValue)}<span className="text-xs font-medium text-slate-500">/h real</span>
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Na teoria ({brl(baseSalary)} ÷ {workHours}h): <strong>{brl(theoryHourValue)}/h</strong>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/40 dark:border-white/10 text-xs">
            <label className="space-y-0.5">
              <span className="text-[11px] text-slate-500">Horas/mês</span>
              <input
                type="number"
                min={1}
                value={workHours}
                onChange={(e) => setWorkHours(Math.max(1, Number(e.target.value) || 220))}
                className="input-base py-1 text-xs"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[11px] text-slate-500">Salário base</span>
              <input
                type="number"
                min={0}
                value={baseSalary}
                onChange={(e) => setBaseSalary(Math.max(0, Number(e.target.value) || 0))}
                className="input-base py-1 text-xs"
              />
            </label>
          </div>
        </div>

        {/* Emergency Reserve */}
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Reserva de Emergência
            </span>
            <Shield className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{brl(emergencyTarget)}</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Atual: <strong>{brl(currentReserve)}</strong> ({reserveProgressPct}%)
              {reserveGap > 0 && monthsToReserve > 0 ? ` · ~${monthsToReserve} meses` : ' · Meta atingida!'}
            </p>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${reserveProgressPct}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-1.5 pt-1 text-xs">
            <label className="space-y-0.5">
              <span className="text-[10px] text-slate-500">Meses</span>
              <input
                type="number"
                min={1}
                max={24}
                value={emergencyMonths}
                onChange={(e) => setEmergencyMonths(Math.max(1, Number(e.target.value) || 4))}
                className="input-base py-1 text-xs"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-slate-500">% Aporte</span>
              <input
                type="number"
                min={1}
                max={100}
                value={investPct}
                onChange={(e) => setInvestPct(Math.max(1, Number(e.target.value) || 30))}
                className="input-base py-1 text-xs"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] text-slate-500">Tenho (R$)</span>
              <input
                type="number"
                min={0}
                placeholder="Auto"
                value={customReserve}
                onChange={(e) => setCustomReserve(e.target.value)}
                className="input-base py-1 text-xs"
              />
            </label>
          </div>
        </div>

        {/* Financial Independence (200x median expenses) */}
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Independência Financeira
            </span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{brl(fiTarget)}</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Regra <strong>200×</strong> sua mediana de gastos ({brl(stats?.median_expenses || 0)}/mês) para viver de 0,5% a.m.
            </p>
          </div>
          <div className="pt-2 border-t border-white/40 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300">
            Aporte planejado ({investPct}%): <strong>{brl(monthlyInvestAmount)}/mês</strong>
          </div>
        </div>

        {/* 60 / 30 / 10 Salary Goals (from Janeiro tab) */}
        <div className="glass-card p-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Objetivos do Salário (60/30/10)
            </span>
            <PieIcon className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Base: {brl(refIncomeRule)}/mês
          </p>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">Gasto Máx. (60%)</span>
              <span className="font-bold text-slate-900 dark:text-white">{brl(ruleMaxSpend60)}</span>
            </div>
            <div className="flex justify-between pl-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>↳ Essenciais (50%) · Diversão (10%)</span>
              <span>{brl(ruleEssential50)} · {brl(ruleFun10)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-600 dark:text-emerald-400">Investimentos (30%)</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{brl(ruleInvest30)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-600 dark:text-blue-400">Economia / Reserva (10%)</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">{brl(ruleEconomy10)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Cashflow Chart (Ganhos vs Gastos + Sobra Acumulada) */}
      <section className="glass-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Fluxo de Caixa Mensal — {year}
            </h2>
          </div>
          {stats && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                Ganhos: {brl(stats.total_income)}
              </span>
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                Gastos: {brl(stats.total_expenses)}
              </span>
              <span
                className={`font-bold ${
                  stats.total_net >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                Sobra Anual: {brl(stats.total_net)}
              </span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="h-72 animate-pulse rounded-2xl bg-white/30 dark:bg-white/5" />
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data?.months || []} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                <XAxis dataKey="short_label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => brl(Number(value ?? 0))}
                  contentStyle={{
                    borderRadius: '14px',
                    border: '1px solid rgba(255,255,255,0.4)',
                    background: 'rgba(15, 23, 42, 0.88)',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="income" name="Ganhos" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" name="Gastos" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Sobra do Mês"
                  stroke="#0071E3"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Table 1: Cashflow Month-by-Month (Ganhos | Gastos | em % | Sobra + Média/Mediana/Total) */}
      <section className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/40 dark:border-white/10 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Resumo Cashflow Mês a Mês ({year})
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Inclui Média, Mediana e Total exatamente como na planilha
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/45 dark:bg-white/5 border-b border-white/40 dark:border-white/10 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <th className="px-4 py-3 text-left">Mês</th>
                <th className="px-4 py-3 text-right">Ganhos</th>
                <th className="px-4 py-3 text-right">Gastos</th>
                <th className="px-4 py-3 text-right">em %</th>
                <th className="px-4 py-3 text-right">Sobra</th>
                <th className="px-4 py-3 text-right">Acumulado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/30 dark:divide-white/5">
              {(data?.months || []).map((m) => (
                <tr key={m.month} className="hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">{m.label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                    {brl(m.income)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-rose-600 dark:text-rose-400 font-medium">
                    {brl(m.expenses)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        m.expense_ratio_pct > 100
                          ? 'bg-rose-100/90 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                          : m.expense_ratio_pct > 75
                          ? 'bg-amber-100/90 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                          : 'bg-emerald-100/90 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {pct(m.expense_ratio_pct)}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                      m.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {brl(m.net)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {brl(m.cumulative_net)}
                  </td>
                </tr>
              ))}
            </tbody>
            {stats && (
              <tfoot className="bg-white/55 dark:bg-white/10 font-bold border-t-2 border-white/60 dark:border-white/15">
                <tr>
                  <td className="px-4 py-2.5 text-slate-900 dark:text-white">Média</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{brl(stats.avg_income)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-rose-600 dark:text-rose-400">{brl(stats.avg_expenses)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{pct(stats.avg_expense_ratio_pct)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{brl(stats.avg_net)}</td>
                  <td className="px-4 py-2.5 text-right">—</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-slate-900 dark:text-white">Mediana</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{brl(stats.median_income)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-rose-600 dark:text-rose-400">{brl(stats.median_expenses)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{pct(stats.median_expense_ratio_pct)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{brl(stats.median_net)}</td>
                  <td className="px-4 py-2.5 text-right">—</td>
                </tr>
                <tr className="text-base">
                  <td className="px-4 py-3 text-slate-900 dark:text-white">Total Anual</td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{brl(stats.total_income)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-rose-600 dark:text-rose-400">{brl(stats.total_expenses)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(stats.total_expense_ratio_pct)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{brl(stats.total_net)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{brl(stats.total_net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Table 2: Month × Category Expense Heatmap Matrix */}
      <section className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/40 dark:border-white/10 flex items-center gap-2">
          <Table2 className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Matriz de Gastos por Categoria × Mês ({year})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mapa de calor automático destacando os maiores gastos de cada mês
            </p>
          </div>
        </div>

        {!data || data.categories.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhuma despesa registrada em {year}. Importe uma fatura pela Mony IA ou cadastre transações para preencher sua matriz anual!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/45 dark:bg-white/5 border-b border-white/40 dark:border-white/10 uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  <th className="px-3 py-3 text-left sticky left-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
                    Mês
                  </th>
                  {data.categories.map((cat) => (
                    <th key={cat} className="px-3 py-3 text-right whitespace-nowrap">
                      {cat}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/30 dark:divide-white/5">
                {data.months.map((m) => (
                  <tr key={m.month} className="hover:bg-white/40 dark:hover:bg-white/5">
                    <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white sticky left-0 bg-white/75 dark:bg-slate-900/75 backdrop-blur">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedYm(m.ym)
                          setSelectedCategory(null)
                        }}
                        className={`hover:underline text-left ${
                          selectedYm === m.ym ? 'text-[var(--accent)] font-extrabold' : ''
                        }`}
                      >
                        {m.label}
                      </button>
                    </td>
                    {data.categories.map((cat) => {
                      const val = m.by_category[cat] || 0
                      const intensity = val > 0 ? Math.min(0.32, (val / maxCatCell) * 0.34) : 0
                      const isSel = selectedYm === m.ym && selectedCategory === cat
                      return (
                        <td
                          key={cat}
                          onClick={() => {
                            setSelectedYm(m.ym)
                            setSelectedCategory(cat)
                          }}
                          title={`Clique para abrir e editar lançamentos de ${cat} em ${m.label}`}
                          className={`px-3 py-2 text-right tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap cursor-pointer transition hover:ring-2 hover:ring-inset hover:ring-[var(--accent)] ${
                            isSel ? 'ring-2 ring-inset ring-[var(--accent)] font-bold' : ''
                          }`}
                          style={
                            intensity > 0
                              ? { backgroundColor: `rgba(244, 63, 94, ${intensity.toFixed(3)})` }
                              : undefined
                          }
                        >
                          {val > 0 ? brl(val) : '—'}
                        </td>
                      )
                    })}
                    <td
                      onClick={() => {
                        setSelectedYm(m.ym)
                        setSelectedCategory(null)
                      }}
                      className="px-3 py-2 text-right tabular-nums font-bold text-slate-900 dark:text-white whitespace-nowrap cursor-pointer hover:underline"
                    >
                      {brl(m.expenses)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {stats && (
                <tfoot className="bg-white/55 dark:bg-white/10 font-semibold border-t-2 border-white/60 dark:border-white/15">
                  <tr>
                    <td className="px-3 py-2 sticky left-0 bg-white/85 dark:bg-slate-900/85">Média</td>
                    {data.categories.map((cat) => (
                      <td key={cat} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {brl(stats.category_avg[cat] || 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{brl(stats.avg_expenses)}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 sticky left-0 bg-white/85 dark:bg-slate-900/85">Mediana</td>
                    {data.categories.map((cat) => (
                      <td key={cat} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {brl(stats.category_median[cat] || 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{brl(stats.median_expenses)}</td>
                  </tr>
                  <tr className="font-bold">
                    <td className="px-3 py-2 sticky left-0 bg-white/85 dark:bg-slate-900/85">Total</td>
                    {data.categories.map((cat) => (
                      <td key={cat} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {brl(stats.category_total[cat] || 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{brl(stats.total_expenses)}</td>
                  </tr>
                  <tr className="text-slate-600 dark:text-slate-300">
                    <td className="px-3 py-2 sticky left-0 bg-white/85 dark:bg-slate-900/85">% s/ Mediana Ganho</td>
                    {data.categories.map((cat) => (
                      <td key={cat} className="px-3 py-2 text-right tabular-nums">
                        {pct(stats.category_pct_of_median_income[cat] || 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{pct(stats.median_expense_ratio_pct)}</td>
                  </tr>
                  <tr className="text-slate-600 dark:text-slate-300">
                    <td className="px-3 py-2 sticky left-0 bg-white/85 dark:bg-slate-900/85">% s/ Total Ganho</td>
                    {data.categories.map((cat) => (
                      <td key={cat} className="px-3 py-2 text-right tabular-nums">
                        {pct(stats.category_pct_of_total_income[cat] || 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{pct(stats.total_expense_ratio_pct)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      {/* Story 5.3: Proactive AI Review Banner for Transactions & Invoice Months */}
      <AISuggestionsBanner
        module="transactions"
        title="Revisão Proativa IA · Transações, Faturas & Transferências"
        onApplied={() => {
          loadCashflow()
          loadMonthTransactions()
        }}
      />

      {/* Story 5.2: Month-by-Month Editable Spreadsheet Detail View */}
      <section className="glass-card overflow-hidden" aria-label="Detalhamento editável mês a mês">
        <div className="px-5 py-4 border-b border-white/40 dark:border-white/10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center flex-wrap gap-2">
                <Pencil className="w-4 h-4 text-[var(--accent)]" />
                Planilha Detalhada do Mês ({selectedYm})
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-200">
                  {selectedCategory
                    ? monthTxs.filter(
                        (t) => (t.category_name || 'Outros').toLowerCase() === selectedCategory.toLowerCase()
                      ).length
                    : monthTxs.length}{' '}
                  lançamento(s)
                </span>
                {selectedCategory && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-[var(--accent-soft)] text-[var(--accent)]">
                    {selectedCategory}
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(null)}
                      aria-label="Limpar filtro de categoria"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Clique direto em qualquer texto, valor, data, conta ou categoria para editar na hora — entradas e saídas sempre separadas.
              </p>
            </div>
          </div>

          {/* 12-Month Quick Switcher */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(data?.months || []).map((m) => (
              <button
                key={m.ym}
                type="button"
                onClick={() => {
                  setSelectedYm(m.ym)
                  setSelectedCategory(null)
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition border ${
                  selectedYm === m.ym
                    ? 'liquid-btn-primary border-transparent'
                    : 'bg-white/45 dark:bg-white/5 border-white/60 dark:border-white/10 text-slate-700 dark:text-slate-300'
                }`}
              >
                {m.short_label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          <EditableSpreadsheetTable
            token={token || ''}
            transactions={
              selectedCategory
                ? monthTxs.filter(
                    (t) => (t.category_name || 'Outros').toLowerCase() === selectedCategory.toLowerCase()
                  )
                : monthTxs
            }
            accounts={accounts}
            categories={userCategories}
            loading={loadingMonthTxs}
            emptyLabel={`Nenhum lançamento encontrado em ${selectedYm}${selectedCategory ? ` para a categoria ${selectedCategory}` : ''}.`}
            onRefresh={async () => {
              await Promise.all([loadCashflow(), loadMonthTransactions(), fetchCategories()])
            }}
            onUpdateCategory={updateCategory}
            onOpenFullModal={(tx) => setEditingTx(tx)}
          />
        </div>
      </section>

      {editingTx && token && (
        <UniversalEditTransactionModal
          token={token}
          transaction={editingTx}
          accounts={accounts}
          categories={
            userCategories.length > 0
              ? userCategories.map((c) => c.name)
              : ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Educação', 'Vestuário', 'Viagem', 'Trabalho', 'Outros']
          }
          onClose={() => setEditingTx(null)}
          onSaved={() => {
            loadCashflow()
            loadMonthTransactions()
          }}
        />
      )}
    </div>
  )
}

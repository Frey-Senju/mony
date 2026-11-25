'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import {
  Calculator,
  TrendingUp,
  Briefcase,
  Calendar,
  Percent,
  Plus,
  Trash2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Send,
  Sparkles,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { useAuth } from '@/stores/auth/useAuth'
import {
  DEFAULT_DSR_CALENDAR,
  calculateRevenueSummary,
  calculateSalaryWithGoal,
  simulateInvestment,
  type DealRow,
  type GoalIndicator,
  type PayrollDiscounts,
} from '@/lib/calculators/financialEngine'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const SALARY_STORAGE_KEY = 'mony_salary_sim_v1'
const INVEST_STORAGE_KEY = 'mony_invest_sim_v1'

const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

function pct(v: number, digits = 2): string {
  return `${(v || 0).toFixed(digits).replace('.', ',')}%`
}

export default function SimulatorsPage() {
  return (
    <PrivateRoute>
      <SimulatorsContent />
    </PrivateRoute>
  )
}

function SimulatorsContent() {
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const [activeTab, setActiveTab] = useState<'salary' | 'invest'>('salary')

  // ==================== Salary with Goal State (spreadsheet defaults) ====================
  const [role, setRole] = useState('Vendedor Interno')
  const [baseSalary, setBaseSalary] = useState(5150)
  const [variableTarget, setVariableTarget] = useState(3433.33)
  const [hasQuinquenio, setHasQuinquenio] = useState(true)
  const [isQuarterEnd, setIsQuarterEnd] = useState(true)
  const [quarterBonusAmount, setQuarterBonusAmount] = useState(300)
  const [impactAdjustments, setImpactAdjustments] = useState(0)

  const currentMonthIdx = new Date().getMonth() + 1
  const [dsrMonth, setDsrMonth] = useState(currentMonthIdx)
  const initialDsr = DEFAULT_DSR_CALENDAR.find((d) => d.month === currentMonthIdx) || DEFAULT_DSR_CALENDAR[10]
  const [businessDays, setBusinessDays] = useState(initialDsr.businessDays)
  const [nonBusinessDays, setNonBusinessDays] = useState(initialDsr.nonBusinessDays)

  const [dependentsCount, setDependentsCount] = useState(0)
  const [otherIrrfDeductions, setOtherIrrfDeductions] = useState(0)

  const [indicators, setIndicators] = useState<GoalIndicator[]>([
    { id: 'margin', name: 'Margem Comercial (sub família)', unit: 'percent', weightPct: 40, goal: 13.7, result: 26.03 },
    { id: 'volume', name: 'Volume de Vendas (sub família)', unit: 'currency', weightPct: 60, goal: 500000, result: 356.64 },
  ])

  const [discounts, setDiscounts] = useState<PayrollDiscounts>({
    restaurant: 0,
    mealVoucher: 133,
    consignedLoan: 0,
    association: 11.43,
    phonePlan: 32,
    other: 0,
  })

  // Optional Deals / Faturamento sub-panel (feeds indicators automatically when enabled)
  const [showDeals, setShowDeals] = useState(false)
  const [useDealsForIndicators, setUseDealsForIndicators] = useState(false)
  const [deals, setDeals] = useState<DealRow[]>([
    { id: 'd1', company: 'Cliente Exemplo', ov: 'OV-001', deal: 'Deal 01', value: 356.64, marginPct: 26.03 },
  ])
  const [extraRevenue, setExtraRevenue] = useState(0)

  // Save as real transaction feedback
  const [postingIncome, setPostingIncome] = useState(false)
  const [postFeedback, setPostFeedback] = useState<string | null>(null)

  // ==================== Investment Simulator State (spreadsheet defaults) ====================
  const [initialCapital, setInitialCapital] = useState(15000)
  const [monthlyRatePct, setMonthlyRatePct] = useState(1.2)
  const [monthlyContribution, setMonthlyContribution] = useState(5000)
  const [swingTradeCost, setSwingTradeCost] = useState(0)
  const [platformCost, setPlatformCost] = useState(0)
  const [investYears, setInvestYears] = useState(10)
  const [showFullMatrix, setShowFullMatrix] = useState(true)

  // Hydrate persisted simulator settings
  useEffect(() => {
    try {
      const sRaw = localStorage.getItem(SALARY_STORAGE_KEY)
      if (sRaw) {
        const s = JSON.parse(sRaw)
        if (s.role !== undefined) setRole(s.role)
        if (s.baseSalary !== undefined) setBaseSalary(s.baseSalary)
        if (s.variableTarget !== undefined) setVariableTarget(s.variableTarget)
        if (s.hasQuinquenio !== undefined) setHasQuinquenio(s.hasQuinquenio)
        if (s.isQuarterEnd !== undefined) setIsQuarterEnd(s.isQuarterEnd)
        if (s.quarterBonusAmount !== undefined) setQuarterBonusAmount(s.quarterBonusAmount)
        if (s.dependentsCount !== undefined) setDependentsCount(s.dependentsCount)
        if (s.indicators?.length) setIndicators(s.indicators)
        if (s.discounts) setDiscounts(s.discounts)
        if (s.deals?.length) setDeals(s.deals)
      }
      const iRaw = localStorage.getItem(INVEST_STORAGE_KEY)
      if (iRaw) {
        const iv = JSON.parse(iRaw)
        if (iv.initialCapital !== undefined) setInitialCapital(iv.initialCapital)
        if (iv.monthlyRatePct !== undefined) setMonthlyRatePct(iv.monthlyRatePct)
        if (iv.monthlyContribution !== undefined) setMonthlyContribution(iv.monthlyContribution)
        if (iv.swingTradeCost !== undefined) setSwingTradeCost(iv.swingTradeCost)
        if (iv.platformCost !== undefined) setPlatformCost(iv.platformCost)
        if (iv.investYears !== undefined) setInvestYears(iv.investYears)
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(
        SALARY_STORAGE_KEY,
        JSON.stringify({
          role,
          baseSalary,
          variableTarget,
          hasQuinquenio,
          isQuarterEnd,
          quarterBonusAmount,
          dependentsCount,
          indicators,
          discounts,
          deals,
        })
      )
    } catch {
      // ignore
    }
  }, [
    role,
    baseSalary,
    variableTarget,
    hasQuinquenio,
    isQuarterEnd,
    quarterBonusAmount,
    dependentsCount,
    indicators,
    discounts,
    deals,
  ])

  useEffect(() => {
    try {
      localStorage.setItem(
        INVEST_STORAGE_KEY,
        JSON.stringify({
          initialCapital,
          monthlyRatePct,
          monthlyContribution,
          swingTradeCost,
          platformCost,
          investYears,
        })
      )
    } catch {
      // ignore
    }
  }, [initialCapital, monthlyRatePct, monthlyContribution, swingTradeCost, platformCost, investYears])

  const revenueSummary = useMemo(
    () => calculateRevenueSummary(deals, extraRevenue),
    [deals, extraRevenue]
  )

  const effectiveIndicators = useMemo(() => {
    if (!useDealsForIndicators) return indicators
    return indicators.map((ind) => {
      if (ind.id === 'margin') {
        return { ...ind, result: Number(revenueSummary.weightedMarginPct.toFixed(2)) }
      }
      if (ind.id === 'volume') {
        return { ...ind, result: Number(revenueSummary.totalRevenue.toFixed(2)) }
      }
      return ind
    })
  }, [indicators, useDealsForIndicators, revenueSummary])

  const salaryResult = useMemo(
    () =>
      calculateSalaryWithGoal({
        role,
        baseSalary,
        variableTarget,
        hasQuinquenio,
        quinquenioRate: 0.049556,
        isQuarterEnd,
        quarterBonusAmount,
        impactAdjustments,
        businessDays,
        nonBusinessDays,
        dependentsCount,
        otherIrrfDeductions,
        indicators: effectiveIndicators,
        discounts,
      }),
    [
      role,
      baseSalary,
      variableTarget,
      hasQuinquenio,
      isQuarterEnd,
      quarterBonusAmount,
      impactAdjustments,
      businessDays,
      nonBusinessDays,
      dependentsCount,
      otherIrrfDeductions,
      effectiveIndicators,
      discounts,
    ]
  )

  const investResult = useMemo(
    () =>
      simulateInvestment({
        initialCapital,
        monthlyRatePct,
        monthlyContribution,
        swingTradeCost,
        platformCost,
        years: investYears,
      }),
    [initialCapital, monthlyRatePct, monthlyContribution, swingTradeCost, platformCost, investYears]
  )

  const handleSelectDsrMonth = (m: number) => {
    setDsrMonth(m)
    const found = DEFAULT_DSR_CALENDAR.find((d) => d.month === m)
    if (found) {
      setBusinessDays(found.businessDays)
      setNonBusinessDays(found.nonBusinessDays)
    }
  }

  const updateIndicator = (id: string, patch: Partial<GoalIndicator>) => {
    setIndicators((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  const handlePostNetSalaryToMony = async () => {
    if (!token || salaryResult.netSalary <= 0) return
    setPostingIncome(true)
    setPostFeedback(null)
    try {
      const acctRes = await fetch(`${API_URL}/accounts`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!acctRes.ok) throw new Error('Não foi possível encontrar sua conta principal')
      const accts = await acctRes.json()
      const list = Array.isArray(accts) ? accts : accts.items || []
      const defAcct = list.find((a: { is_default?: boolean }) => a.is_default) || list[0]
      if (!defAcct) throw new Error('Crie uma conta em Contas antes de lançar.')

      const today = new Date()
      const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
      const res = await fetch(`${API_URL}/transactions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_id: defAcct.id,
          type: 'income',
          amount: Number(salaryResult.netSalary.toFixed(2)),
          description: `Salário Líquido (${role}) · Meta ${(salaryResult.totalAchievedPct * 100).toFixed(1)}%`,
          merchant_name: role,
          category_name: 'Trabalho',
          payment_method: 'bank_transfer',
          transaction_date: today.toISOString().slice(0, 10),
          statement_month: ym,
          notes: `Bruto: ${brl(salaryResult.grossSalary)} | DSR: ${brl(salaryResult.dsrAmount)} | INSS: ${brl(salaryResult.inss.totalINSS)} | IRRF: ${brl(salaryResult.irrf.finalIRRF)}`,
        }),
      })
      if (!res.ok) throw new Error('Erro ao cadastrar salário como receita')
      setPostFeedback(`Salário líquido (${brl(salaryResult.netSalary)}) lançado na conta "${defAcct.name}"!`)
      window.dispatchEvent(new CustomEvent('mony:transactions-updated'))
    } catch (err) {
      setPostFeedback(err instanceof Error ? err.message : 'Erro ao lançar receita')
    } finally {
      setPostingIncome(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header + Segmented Mode Switcher */}
      <header className="glass-panel flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ background: 'var(--accent)' }}
            aria-hidden="true"
          >
            <Calculator className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Simuladores Financeiros
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Salário com Meta (DSR, INSS, IRRF 2026 & Faturamento) + Simulador de Investimentos em 10 anos
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Escolha o simulador"
          className="grid grid-cols-2 p-1 rounded-2xl bg-white/55 dark:bg-white/10 border border-white/70 dark:border-white/15"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'salary'}
            onClick={() => setActiveTab('salary')}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === 'salary' ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Salário com Meta
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'invest'}
            onClick={() => setActiveTab('invest')}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === 'invest' ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Investimentos (10 anos)
          </button>
        </div>
      </header>

      {/* ==================== TAB 1: SALÁRIO COM META + DSR + INSS + IRRF ==================== */}
      {activeTab === 'salary' ? (
        <div className="space-y-6">
          {/* Top Live Output KPI Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="glass-card p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Atingimento Ponderado</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {pct(salaryResult.totalAchievedPct * 100)}
              </p>
              <span
                className={`inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  salaryResult.gateStatus === 'accelerated'
                    ? 'bg-emerald-100/90 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                    : salaryResult.gateStatus === 'below_gate'
                    ? 'bg-rose-100/90 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                    : 'bg-blue-100/90 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                }`}
              >
                {salaryResult.gateStatus === 'accelerated'
                  ? `Acelerador 4× (${pct(salaryResult.variablePayoutPct * 100)})`
                  : salaryResult.gateStatus === 'below_gate'
                  ? 'Abaixo do gatilho (< 60%)'
                  : `Paga ${pct(salaryResult.variablePayoutPct * 100)} do Target`}
              </span>
            </div>

            <div className="glass-card p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Variável + Bônus</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {brl(salaryResult.variableEndOfMonth)}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                DSR Comissões: <strong>{brl(salaryResult.dsrAmount)}</strong>
              </p>
            </div>

            <div className="glass-card p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Salário Bruto Total</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {brl(salaryResult.grossSalary)}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Base + Variável + DSR{hasQuinquenio ? ` + Quinq. (${brl(salaryResult.quinquenioAmount)})` : ''}
              </p>
            </div>

            <div className="glass-card p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total de Descontos</p>
              <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                - {brl(salaryResult.totalDiscounts)}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {pct(salaryResult.totalDiscountsPct)} do bruto (INSS + IRRF + Folha)
              </p>
            </div>

            <div
              className="glass-card p-4 border-2"
              style={{ borderColor: 'var(--accent)' }}
            >
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Salário Líquido Total</p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {brl(salaryResult.netSalary)}
              </p>
              <button
                type="button"
                onClick={handlePostNetSalaryToMony}
                disabled={postingIncome}
                className="mt-2 w-full liquid-btn liquid-btn-primary py-1.5 px-2.5 rounded-xl text-[11px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
                {postingIncome ? 'Lançando...' : 'Lançar como Receita'}
              </button>
            </div>
          </div>

          {postFeedback && (
            <div role="status" className="glass-card p-3.5 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {postFeedback}
            </div>
          )}

          {/* Main Parameters + DSR Calendar */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Base & Variable Config */}
            <div className="glass-card p-5 lg:col-span-2 space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Briefcase className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                Parâmetros do Cargo & Variável
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Cargo</label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="input-base"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Salário Base (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(Number(e.target.value) || 0)}
                    className="input-base"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Target Variável (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={variableTarget}
                    onChange={(e) => setVariableTarget(Number(e.target.value) || 0)}
                    className="input-base"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white/45 dark:bg-white/5 border border-white/60 dark:border-white/10 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasQuinquenio}
                    onChange={(e) => setHasQuinquenio(e.target.checked)}
                    className="rounded"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-100 block">Quinquênio (~5%)</span>
                    <span className="text-[11px] text-slate-500">{brl(salaryResult.quinquenioAmount)}</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white/45 dark:bg-white/5 border border-white/60 dark:border-white/10 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isQuarterEnd}
                    onChange={(e) => setIsQuarterEnd(e.target.checked)}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 block">Fechamento Trimestre</span>
                    <input
                      type="number"
                      value={quarterBonusAmount}
                      onChange={(e) => setQuarterBonusAmount(Number(e.target.value) || 0)}
                      className="mt-0.5 w-24 bg-transparent border-b border-slate-300 dark:border-white/20 text-[11px] focus:outline-none"
                    />
                  </div>
                </label>

                <div className="p-2.5 rounded-xl bg-white/45 dark:bg-white/5 border border-white/60 dark:border-white/10 text-xs">
                  <label className="block font-semibold text-slate-800 dark:text-slate-100 mb-0.5">
                    Notas de Impacto (-R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={impactAdjustments}
                    onChange={(e) => setImpactAdjustments(Number(e.target.value) || 0)}
                    className="input-base py-1 text-xs"
                  />
                </div>
              </div>

              {/* Indicators Table */}
              <div className="pt-2 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Indicadores & Metas (Gatilho 60% · Acelerador 4× &gt; 100%)
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowDeals((v) => !v)}
                    className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    {showDeals ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Cálculo de Faturamento (Deals)
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/40 dark:border-white/10 text-slate-500 uppercase">
                        <th className="py-2 text-left">Indicador</th>
                        <th className="py-2 text-right w-20">Peso %</th>
                        <th className="py-2 text-right w-28">Meta</th>
                        <th className="py-2 text-right w-28">Resultado</th>
                        <th className="py-2 text-right">Ating. Meta</th>
                        <th className="py-2 text-right">Ating. Peso</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/30 dark:divide-white/5">
                      {salaryResult.indicators.map((ind) => (
                        <tr key={ind.id}>
                          <td className="py-2 pr-2">
                            <input
                              type="text"
                              value={ind.name}
                              onChange={(e) => updateIndicator(ind.id, { name: e.target.value })}
                              className="input-base py-1 text-xs"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="number"
                              step="1"
                              value={ind.weightPct}
                              onChange={(e) => updateIndicator(ind.id, { weightPct: Number(e.target.value) || 0 })}
                              className="input-base py-1 text-xs text-right"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="number"
                              step="0.01"
                              value={ind.goal}
                              onChange={(e) => updateIndicator(ind.id, { goal: Number(e.target.value) || 0 })}
                              className="input-base py-1 text-xs text-right"
                            />
                          </td>
                          <td className="py-2 px-1">
                            <input
                              type="number"
                              step="0.01"
                              disabled={useDealsForIndicators && (ind.id === 'margin' || ind.id === 'volume')}
                              value={ind.result}
                              onChange={(e) => updateIndicator(ind.id, { result: Number(e.target.value) || 0 })}
                              className="input-base py-1 text-xs text-right disabled:opacity-60"
                            />
                          </td>
                          <td className="py-2 pl-2 text-right font-semibold tabular-nums">
                            {pct(ind.achievementPct * 100)}
                          </td>
                          <td className="py-2 pl-2 text-right font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                            {pct(ind.weightedContributionPct * 100)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Expandable Deals / Cálculo Faturamento Panel */}
                {showDeals && (
                  <div className="p-4 rounded-2xl bg-white/45 dark:bg-white/5 border border-white/60 dark:border-white/10 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          Cálculo de Faturamento & Margem Ponderada (Deals)
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Faturamento Real: <strong>{brl(revenueSummary.totalRevenue)}</strong> · Margem Líquida:{' '}
                          <strong>{pct(revenueSummary.weightedMarginPct)}</strong> · Lucro:{' '}
                          <strong>{brl(revenueSummary.totalProfit)}</strong>
                        </p>
                      </div>
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useDealsForIndicators}
                          onChange={(e) => setUseDealsForIndicators(e.target.checked)}
                          className="rounded"
                        />
                        Alimentar indicadores automaticamente
                      </label>
                    </div>

                    <div className="space-y-2">
                      {deals.map((d) => (
                        <div key={d.id} className="grid grid-cols-12 gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Empresa"
                            value={d.company}
                            onChange={(e) =>
                              setDeals((prev) => prev.map((x) => (x.id === d.id ? { ...x, company: e.target.value } : x)))
                            }
                            className="input-base py-1 text-xs col-span-4"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Valor (R$)"
                            value={d.value}
                            onChange={(e) =>
                              setDeals((prev) =>
                                prev.map((x) => (x.id === d.id ? { ...x, value: Number(e.target.value) || 0 } : x))
                              )
                            }
                            className="input-base py-1 text-xs col-span-3 text-right"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Margem %"
                            value={d.marginPct}
                            onChange={(e) =>
                              setDeals((prev) =>
                                prev.map((x) => (x.id === d.id ? { ...x, marginPct: Number(e.target.value) || 0 } : x))
                              )
                            }
                            className="input-base py-1 text-xs col-span-2 text-right"
                          />
                          <span className="col-span-2 text-right text-xs font-semibold tabular-nums">
                            {brl((d.value * d.marginPct) / 100)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setDeals((prev) => prev.filter((x) => x.id !== d.id))}
                            aria-label="Remover deal"
                            className="col-span-1 flex justify-end text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setDeals((prev) => [
                            ...prev,
                            { id: `d-${Date.now()}`, company: '', value: 0, marginPct: 15 },
                          ])
                        }
                        className="liquid-btn liquid-btn-glass px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar Deal
                      </button>
                      <label className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500">Faturamento Extra (R$):</span>
                        <input
                          type="number"
                          step="0.01"
                          value={extraRevenue}
                          onChange={(e) => setExtraRevenue(Number(e.target.value) || 0)}
                          className="input-base py-1 text-xs w-28 text-right"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* DSR Calculator Card */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Cálculo DSR Comissões</h2>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Mês de referência
                </label>
                <select
                  value={dsrMonth}
                  onChange={(e) => handleSelectDsrMonth(Number(e.target.value))}
                  className="input-base"
                >
                  {DEFAULT_DSR_CALENDAR.map((d) => (
                    <option key={d.month} value={d.month}>
                      {d.name} ({d.businessDays} úteis / {d.nonBusinessDays} não-úteis)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Dias Úteis
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={businessDays}
                    onChange={(e) => setBusinessDays(Math.max(1, Number(e.target.value) || 1))}
                    className="input-base"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Domingos / Feriados
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={nonBusinessDays}
                    onChange={(e) => setNonBusinessDays(Math.max(0, Number(e.target.value) || 0))}
                    className="input-base"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/50 dark:bg-white/5 border border-white/60 dark:border-white/10 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Base Comissões</span>
                  <span className="font-semibold">{brl(salaryResult.variableEndOfMonth)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fórmula</span>
                  <span className="font-mono text-[11px]">
                    {nonBusinessDays} × (Comissão ÷ {businessDays})
                  </span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-white/40 dark:border-white/10 text-sm font-bold">
                  <span>DSR a Receber</span>
                  <span className="text-emerald-600 dark:text-emerald-400">{brl(salaryResult.dsrAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3-Column Detailed Breakdown: INSS | IRRF 2026 | Descontos em Folha */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* INSS Progressive Brackets */}
            <div className="glass-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">INSS Progressivo (2026)</h3>
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  - {brl(salaryResult.inss.totalINSS)}
                </span>
              </div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-white/40 dark:border-white/10 text-slate-500">
                    <th className="py-1.5 text-left">Faixa</th>
                    <th className="py-1.5 text-right">Alíq.</th>
                    <th className="py-1.5 text-right">Contrib.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/25 dark:divide-white/5">
                  {salaryResult.inss.brackets.map((b, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 text-slate-700 dark:text-slate-300">
                        {brl(b.from)} – {brl(b.to)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{pct(b.rate * 100, 1)}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{brl(b.contribution)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                Alíquota efetiva: <strong>{pct(salaryResult.inss.effectiveRatePct)}</strong>
                {salaryResult.inss.ceilingReached ? ' · Teto INSS atingido' : ''}
              </p>
            </div>

            {/* IRRF 2026 Legal vs Simplified */}
            <div className="glass-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">IRRF (Regra 2026)</h3>
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  - {brl(salaryResult.irrf.finalIRRF)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="space-y-0.5">
                  <span className="text-[11px] text-slate-500">Dependentes</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={dependentsCount}
                    onChange={(e) => setDependentsCount(Math.max(0, Number(e.target.value) || 0))}
                    className="input-base py-1 text-xs"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[11px] text-slate-500">Outras Deduções (R$)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={otherIrrfDeductions}
                    onChange={(e) => setOtherIrrfDeductions(Math.max(0, Number(e.target.value) || 0))}
                    className="input-base py-1 text-xs"
                  />
                </label>
              </div>

              <div className="space-y-2 text-xs">
                <div
                  className={`p-2.5 rounded-xl border ${
                    salaryResult.irrf.bestMethod === 'legal'
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-400/60'
                      : 'bg-white/40 dark:bg-white/5 border-white/50 dark:border-white/10'
                  }`}
                >
                  <div className="flex justify-between font-semibold">
                    <span>Deduções Legais {salaryResult.irrf.bestMethod === 'legal' ? '★ Melhor' : ''}</span>
                    <span>{brl(salaryResult.irrf.legal.taxDue)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Base: {brl(salaryResult.irrf.legal.taxableBase)} · Alíq. {pct(salaryResult.irrf.legal.rate * 100, 1)}
                  </p>
                </div>

                <div
                  className={`p-2.5 rounded-xl border ${
                    salaryResult.irrf.bestMethod === 'simplified'
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-400/60'
                      : 'bg-white/40 dark:bg-white/5 border-white/50 dark:border-white/10'
                  }`}
                >
                  <div className="flex justify-between font-semibold">
                    <span>Desconto Simplificado (R$ 607,20) {salaryResult.irrf.bestMethod === 'simplified' ? '★ Melhor' : ''}</span>
                    <span>{brl(salaryResult.irrf.simplified.taxDue)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Base: {brl(salaryResult.irrf.simplified.taxableBase)} · Alíq. {pct(salaryResult.irrf.simplified.rate * 100, 1)}
                  </p>
                </div>

                {salaryResult.irrf.exemptUnder5000 && (
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Isento pela faixa 2026 (salário bruto até R$ 5.000,00).
                  </p>
                )}
                {salaryResult.irrf.progressiveReducer2026 > 0 && (
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Redutor progressivo 2026 aplicado: -{brl(salaryResult.irrf.progressiveReducer2026)}
                  </p>
                )}
              </div>
            </div>

            {/* Payroll Discounts */}
            <div className="glass-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Descontos em Folha</h3>
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  - {brl(salaryResult.otherDiscountsTotal)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {(
                  [
                    ['restaurant', 'Restaurante'],
                    ['mealVoucher', 'Vale Refeição'],
                    ['consignedLoan', 'Consignado'],
                    ['association', 'Associação'],
                    ['phonePlan', 'Plano Telefonia'],
                    ['other', 'Outros'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="space-y-0.5">
                    <span className="text-[11px] text-slate-500">{label} (R$)</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={discounts[key]}
                      onChange={(e) =>
                        setDiscounts((prev) => ({ ...prev, [key]: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      className="input-base py-1 text-xs"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ==================== TAB 2: SIMULADOR DE RESULTADOS DE INVESTIMENTO (10 ANOS) ==================== */
        <div className="space-y-6">
          {/* Controls Panel */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Percent className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                Parâmetros da Simulação (Juros Compostos Mensais)
              </h2>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { label: 'Poupança (0,5%)', rate: 0.5 },
                  { label: 'CDI (0,95%)', rate: 0.95 },
                  { label: 'FII/Ações (1,5%)', rate: 1.5 },
                  { label: 'Planilha (4,0%)', rate: 4.0 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setMonthlyRatePct(preset.rate)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition ${
                      monthlyRatePct === preset.rate
                        ? 'liquid-nav-active border-white/70'
                        : 'bg-white/45 dark:bg-white/5 border-white/60 dark:border-white/10 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <label className="space-y-1 text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Capital Inicial (R$)</span>
                <input
                  type="number"
                  min={0}
                  step="100"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Math.max(0, Number(e.target.value) || 0))}
                  className="input-base"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Taxa (% a.m.)</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  step="0.05"
                  value={monthlyRatePct}
                  onChange={(e) => setMonthlyRatePct(Math.max(0, Number(e.target.value) || 0))}
                  className="input-base"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Aporte Mensal (R$)</span>
                <input
                  type="number"
                  min={0}
                  step="100"
                  value={monthlyContribution}
                  onChange={(e) => setMonthlyContribution(Math.max(0, Number(e.target.value) || 0))}
                  className="input-base"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Custo Swing Trade</span>
                <input
                  type="number"
                  min={0}
                  step="10"
                  value={swingTradeCost}
                  onChange={(e) => setSwingTradeCost(Math.max(0, Number(e.target.value) || 0))}
                  className="input-base"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Custo Plataforma</span>
                <input
                  type="number"
                  min={0}
                  step="10"
                  value={platformCost}
                  onChange={(e) => setPlatformCost(Math.max(0, Number(e.target.value) || 0))}
                  className="input-base"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Horizonte (Anos)</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={investYears}
                  onChange={(e) => setInvestYears(Math.min(20, Math.max(1, Number(e.target.value) || 10)))}
                  className="input-base"
                />
              </label>
            </div>
          </div>

          {/* Investment KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Patrimônio Final ({investYears}º Ano)
              </p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {brl(investResult.finalBalance)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Anual: {pct(investResult.annualLinearRatePct, 1)} linear · {pct(investResult.annualCompoundRatePct, 1)} composto
              </p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Aportado (do seu bolso)</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {brl(investResult.totalInvested)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Inicial {brl(initialCapital)} + {investYears * 12}× {brl(monthlyContribution)}
              </p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Lucro em Juros Compostos</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {brl(investResult.totalInterest)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {investResult.finalBalance > 0
                  ? `${pct((investResult.totalInterest / investResult.finalBalance) * 100, 1)} do patrimônio final`
                  : '—'}
              </p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Renda Passiva no {investYears}º Ano
              </p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                {brl(investResult.estimatedMonthlyPassiveIncome)}
                <span className="text-xs font-normal text-slate-500">/mês</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Mantendo {pct(monthlyRatePct)} a.m. sobre o saldo final
              </p>
            </div>
          </div>

          {/* Growth Area Chart */}
          <div className="glass-card p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Evolução Patrimonial: Aportes vs. Juros Compostos
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={investResult.chartPoints} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M` : `R$${(v / 1000).toFixed(0)}k`
                    }
                  />
                  <Tooltip
                    formatter={(val) => brl(Number(val ?? 0))}
                    contentStyle={{
                      borderRadius: '14px',
                      border: '1px solid rgba(255,255,255,0.4)',
                      background: 'rgba(15, 23, 42, 0.88)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Area
                    type="monotone"
                    dataKey="aportado"
                    name="Total Aportado"
                    stackId="1"
                    stroke="#0071E3"
                    fill="#0071E3"
                    fillOpacity={0.35}
                  />
                  <Area
                    type="monotone"
                    dataKey="juros"
                    name="Juros Compostos"
                    stackId="1"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.45}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Month × Year 10-Year Table (exact spreadsheet grid!) */}
          <div className="glass-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/40 dark:border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Grade Mensal de Evolução (Janeiro a Dezembro · {investYears} anos)
              </h3>
              <button
                type="button"
                onClick={() => setShowFullMatrix((v) => !v)}
                className="text-xs font-semibold hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                {showFullMatrix ? 'Ocultar grade' : 'Mostrar grade'}
              </button>
            </div>

            {showFullMatrix && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/45 dark:bg-white/5 border-b border-white/40 dark:border-white/10 text-slate-600 dark:text-slate-300">
                      <th className="px-3 py-2.5 text-left sticky left-0 bg-white/85 dark:bg-slate-900/85">Mês</th>
                      {investResult.years.map((yr) => (
                        <th key={yr.year} className="px-3 py-2.5 text-right whitespace-nowrap">
                          {yr.year}º Ano
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/25 dark:divide-white/5">
                    <tr className="bg-white/30 dark:bg-white/5 font-semibold">
                      <td className="px-3 py-2 sticky left-0 bg-white/80 dark:bg-slate-900/80">Saldo Inicial</td>
                      {investResult.years.map((yr) => (
                        <td key={yr.year} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          {brl(yr.startBalance)}
                        </td>
                      ))}
                    </tr>
                    {MONTH_LABELS.map((mName, mIdx) => (
                      <tr key={mName} className="hover:bg-white/40 dark:hover:bg-white/5">
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200 sticky left-0 bg-white/75 dark:bg-slate-900/75">
                          {mName}
                        </td>
                        {investResult.years.map((yr) => (
                          <td
                            key={yr.year}
                            className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${
                              mIdx === 11 ? 'font-bold text-emerald-600 dark:text-emerald-400' : ''
                            }`}
                          >
                            {brl(yr.months[mIdx])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

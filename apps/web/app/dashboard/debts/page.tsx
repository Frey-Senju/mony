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
} from 'recharts'
import {
  Scale,
  Plus,
  Trash2,
  TrendingUp,
  Calculator,
  Sparkles,
  X,
  Landmark,
  Flame,
  Snowflake,
  CheckCircle2,
  CalendarCheck,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/stores/auth/useAuth'
import { useAppearance } from '@/app/_theme/provider'
import { dispatchToast } from '@/components/ui/ToastProvider'
import { NetWorthHistoryPanel } from '@/components/debts/NetWorthHistoryPanel'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface DebtItem {
  id: string
  name: string
  debt_type: string
  creditor?: string | null
  original_amount: number
  current_balance: number
  paid_pct: number
  interest_rate_monthly: number
  monthly_payment: number
  remaining_installments?: number | null
  due_day: number
  amortization_system: string
  is_active: boolean
}

interface NetWorthData {
  assets_total: number
  liabilities_total: number
  net_worth: number
  breakdown: {
    liquid_cash: number
    investment_accounts: number
    b3_portfolio: number
    debts: number
    credit_cards: number
  }
  history_6m: Array<{ ym: string; label: string; net_worth: number; monthly_delta: number }>
}

interface StrategyResult {
  recommended: 'avalanche' | 'snowball'
  interest_saved_vs_snowball: number
  interest_saved_with_extra: number
  months_saved_with_extra: number
  avalanche: { months: number; total_interest: number; payoff_order: Array<{ name: string; paid_off_month: number }> }
  snowball: { months: number; total_interest: number; payoff_order: Array<{ name: string; paid_off_month: number }> }
}

interface AmortResult {
  monthly_rate_pct: number
  sac_savings_vs_price: number
  price: { first_installment: number; last_installment: number; total_interest: number; months_saved: number; interest_saved: number }
  sac: { first_installment: number; last_installment: number; total_interest: number; months_saved: number; interest_saved: number }
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function DebtsAndNetWorthPage() {
  return (
    <PrivateRoute>
      <DebtsContent />
    </PrivateRoute>
  )
}

function DebtsContent() {
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const { chartPalette } = useAppearance()

  const [debts, setDebts] = useState<DebtItem[]>([])
  const [summary, setSummary] = useState({ total_balance: 0, total_monthly_payment: 0, weighted_monthly_rate: 0, active_count: 0 })
  const [netWorth, setNetWorth] = useState<NetWorthData | null>(null)
  const [debtFreeInfo, setDebtFreeInfo] = useState<{
    is_debt_free: boolean
    total_debt_balance: number
    monthly_payment: number
    months_remaining: number
    debt_free_ym: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)

  // Strategy simulator
  const [extraMonthly, setExtraMonthly] = useState(500)
  const [strategy, setStrategy] = useState<StrategyResult | null>(null)

  // SAC vs Price simulator
  const [simBal, setSimBal] = useState(200000)
  const [simRate, setSimRate] = useState(10.5)
  const [simMonths, setSimMonths] = useState(240)
  const [simExtra, setSimExtra] = useState(20000)
  const [amort, setAmort] = useState<AmortResult | null>(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DebtItem | null>(null)
  const [deletingDebt, setDeletingDebt] = useState(false)
  const [amortizeDebt, setAmortizeDebt] = useState<DebtItem | null>(null)
  const [amortizeAmount, setAmortizeAmount] = useState('')
  const [amortizing, setAmortizing] = useState(false)
  const [form, setForm] = useState({
    name: '',
    debt_type: 'personal_loan',
    creditor: '',
    original_amount: '',
    current_balance: '',
    interest_rate_monthly: '1.5',
    monthly_payment: '',
    due_day: 10,
    amortization_system: 'price',
  })

  const loadAll = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [dRes, nwRes, gamRes] = await Promise.all([
        fetch(`${API_URL}/debts`, { headers }),
        fetch(`${API_URL}/reports/net-worth`, { headers }),
        fetch(`${API_URL}/insights/gamification`, { headers }).catch(() => null),
      ])
      if (dRes.ok) {
        const d = await dRes.json()
        setDebts(d.items || [])
        setSummary(d.summary || { total_balance: 0, total_monthly_payment: 0, weighted_monthly_rate: 0, active_count: 0 })
      }
      if (nwRes.ok) {
        setNetWorth(await nwRes.json())
      }
      if (gamRes?.ok) {
        const g = await gamRes.json()
        if (g?.debt_free) setDebtFreeInfo(g.debt_free)
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const runStrategy = useCallback(async () => {
    if (!token || debts.length === 0) {
      setStrategy(null)
      return
    }
    const res = await fetch(`${API_URL}/debts/strategy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ extra_monthly_payment: extraMonthly }),
    })
    if (res.ok) setStrategy(await res.json())
  }, [token, debts.length, extraMonthly])

  useEffect(() => {
    runStrategy()
  }, [runStrategy])

  const runAmort = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!token) return
    const res = await fetch(`${API_URL}/debts/amortization`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        balance: simBal,
        annual_rate_pct: simRate,
        months: simMonths,
        extra_amortization: simExtra,
      }),
    })
    if (res.ok) setAmort(await res.json())
  }

  const handleCreateDebt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/debts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          debt_type: form.debt_type,
          creditor: form.creditor.trim() || null,
          original_amount: Number(form.original_amount),
          current_balance: Number(form.current_balance || form.original_amount),
          interest_rate_monthly: Number(form.interest_rate_monthly || 0),
          monthly_payment: Number(form.monthly_payment || 0),
          due_day: Number(form.due_day || 10),
          amortization_system: form.amortization_system,
        }),
      })
      if (res.ok) {
        setModalOpen(false)
        setForm({
          name: '',
          debt_type: 'personal_loan',
          creditor: '',
          original_amount: '',
          current_balance: '',
          interest_rate_monthly: '1.5',
          monthly_payment: '',
          due_day: 10,
          amortization_system: 'price',
        })
        dispatchToast('Dívida/financiamento cadastrado!', 'success')
        await loadAll()
      }
    } finally {
      setSaving(false)
    }
  }

  const executeDeleteDebt = async () => {
    if (!token || !deleteTarget) return
    setDeletingDebt(true)
    try {
      const res = await fetch(`${API_URL}/debts/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        dispatchToast(`Dívida "${deleteTarget.name}" removida.`, 'info')
        setDeleteTarget(null)
        await loadAll()
      }
    } finally {
      setDeletingDebt(false)
    }
  }

  const handleAmortizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !amortizeDebt) return
    const payVal = parseFloat(amortizeAmount.replace(',', '.'))
    if (!Number.isFinite(payVal) || payVal <= 0) return
    setAmortizing(true)
    try {
      const nextBalance = Math.max(0, Number(amortizeDebt.current_balance) - payVal)
      const nextInstallments =
        typeof amortizeDebt.remaining_installments === 'number'
          ? Math.max(0, amortizeDebt.remaining_installments - 1)
          : undefined
      const res = await fetch(`${API_URL}/debts/${amortizeDebt.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_balance: Number(nextBalance.toFixed(2)),
          ...(nextInstallments !== undefined ? { remaining_installments: nextInstallments } : {}),
          is_active: nextBalance > 0,
        }),
      })
      if (!res.ok) throw new Error('Erro ao registrar amortização')
      dispatchToast(
        nextBalance <= 0
          ? `🎉 "${amortizeDebt.name}" quitada!`
          : `Amortização de ${brl(payVal)} registrada em "${amortizeDebt.name}"!`,
        'success'
      )
      setAmortizeDebt(null)
      setAmortizeAmount('')
      await loadAll()
    } catch (err) {
      dispatchToast(err instanceof Error ? err.message : 'Erro ao amortizar', 'error')
    } finally {
      setAmortizing(false)
    }
  }

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
            <Scale className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Patrimônio Líquido &amp; Dívidas
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              Ativos − Passivos, Estrategista Avalanche vs Bola de Neve e Amortização SAC vs Price
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Nova Dívida / Financiamento
        </button>
      </header>

      {/* EPIC-015 Wave 3: Debt-Free Date Countdown Card (Debt Payoff Planner) */}
      {debtFreeInfo && (
        <section
          className={`glass-panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            debtFreeInfo.is_debt_free
              ? 'border-emerald-400/50 bg-emerald-500/5'
              : 'border-violet-400/40 bg-violet-500/5'
          }`}
          aria-label="Data estimada livre de dívidas"
        >
          <div className="flex items-center gap-3">
            <span
              className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0 ${
                debtFreeInfo.is_debt_free
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                  : 'bg-gradient-to-br from-violet-500 to-indigo-600'
              }`}
              aria-hidden="true"
            >
              <CalendarCheck className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Contagem Regressiva · Debt-Free Date
              </p>
              {debtFreeInfo.is_debt_free ? (
                <h2 className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                  🕊️ Parabéns! Você está Livre de Dívidas
                </h2>
              ) : debtFreeInfo.debt_free_ym ? (
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Livre de dívidas em{' '}
                  <span className="text-violet-600 dark:text-violet-400">
                    {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
                      new Date(
                        Number(debtFreeInfo.debt_free_ym.split('-')[0]),
                        Number(debtFreeInfo.debt_free_ym.split('-')[1]) - 1,
                        1
                      )
                    )}
                  </span>
                </h2>
              ) : (
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Informe a parcela mensal para calcular sua data de quitação
                </h2>
              )}
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {debtFreeInfo.is_debt_free
                  ? 'Saldo devedor zerado — direcione seus aportes para patrimônio e renda passiva no Valuer.'
                  : debtFreeInfo.months_remaining > 0
                  ? `Faltam ${debtFreeInfo.months_remaining} mês(es) no ritmo atual de ${brl(debtFreeInfo.monthly_payment)}/mês.`
                  : `Saldo atual de ${brl(debtFreeInfo.total_debt_balance)} em dívidas ativas.`}
              </p>
            </div>
          </div>
          {!debtFreeInfo.is_debt_free && debtFreeInfo.months_remaining > 0 && (
            <div className="glass-card px-4 py-2.5 text-center shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Faltam</p>
              <p className="text-2xl font-black text-violet-600 dark:text-violet-400">
                {debtFreeInfo.months_remaining}m
              </p>
            </div>
          )}
        </section>
      )}

      {/* EPIC-010: 12-Month Net Worth Evolution + 3m Projection */}
      <NetWorthHistoryPanel token={token} />

      {/* Net Worth Summary + 6m Trajectory */}
      {netWorth && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5" aria-label="Patrimônio líquido consolidado">
          <div className="lg:col-span-5 grid grid-cols-1 gap-3">
            <div className="glass-panel">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Patrimônio Líquido (Net Worth)
              </p>
              <p
                className={`text-3xl font-extrabold mt-1 money-value ${
                  netWorth.net_worth >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {brl(netWorth.net_worth)}
              </p>
              <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-200/60 dark:border-white/10 text-xs">
                <div>
                  <p className="text-slate-500">Ativos Totais</p>
                  <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 money-value">
                    {brl(netWorth.assets_total)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Caixa {brl(netWorth.breakdown.liquid_cash)} · B3 {brl(netWorth.breakdown.b3_portfolio)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Passivos Totais</p>
                  <p className="text-base font-bold text-rose-600 dark:text-rose-400 money-value">
                    {brl(netWorth.liabilities_total)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 money-value">
                    Dívidas {brl(netWorth.breakdown.debts)} · Cartões {brl(netWorth.breakdown.credit_cards)}
                  </p>
                </div>
              </div>
              {/* Assets vs Liabilities Visual Balance Bar */}
              {(() => {
                const totalBoth = Math.max(1, netWorth.assets_total + netWorth.liabilities_total)
                const assetsPct = Math.round((netWorth.assets_total / totalBoth) * 100)
                return (
                  <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-white/10 space-y-1">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span className="text-emerald-600 dark:text-emerald-400">Ativos ({assetsPct}%)</span>
                      <span className="text-rose-600 dark:text-rose-400">Passivos ({100 - assetsPct}%)</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-rose-500/20">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                        style={{ width: `${assetsPct}%` }}
                      />
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 to-red-500 transition-all duration-500"
                        style={{ width: `${100 - assetsPct}%` }}
                      />
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          <div className="lg:col-span-7 glass-card p-5 space-y-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" aria-hidden="true" />
              Evolução do Patrimônio Líquido (6 Meses)
            </h2>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={netWorth.history_6m} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `R$ ${(Number(v) / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={64} />
                  <Tooltip formatter={(v) => brl(Number(v ?? 0))} />
                  <Area
                    type="monotone"
                    dataKey="net_worth"
                    name="Patrimônio Líquido"
                    stroke={chartPalette[1]}
                    fill={chartPalette[1]}
                    fillOpacity={0.25}
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Active Debts List */}
      <section className="glass-panel space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Landmark className="w-5 h-5 text-rose-500" aria-hidden="true" />
              Dívidas, Empréstimos &amp; Financiamentos ({summary.active_count})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Parcelas mensais: <strong className="money-value">{brl(summary.total_monthly_payment)}</strong> · Juros médio ponderado: <strong>{summary.weighted_monthly_rate}%/mês</strong>
            </p>
          </div>
        </div>

        {loading ? (
          <div className="h-28 glass-card animate-pulse" />
        ) : debts.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
            Nenhuma dívida ou financiamento cadastrado. Cadastre acima para ativar o estrategista Avalanche vs Bola de Neve!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {debts.map((d) => (
              <div key={d.id} className="glass-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{d.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {d.creditor ? `${d.creditor} · ` : ''}
                      {d.interest_rate_monthly}% a.m. · {d.amortization_system.toUpperCase()} · Dia {d.due_day}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {d.current_balance > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAmortizeDebt(d)
                          setAmortizeAmount(
                            String(d.monthly_payment > 0 ? d.monthly_payment : Math.min(500, d.current_balance))
                          )
                        }}
                        className="liquid-btn liquid-btn-glass px-2.5 py-1 rounded-xl text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1"
                        title="Registrar pagamento de parcela ou amortização extra"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Amortizar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(d)}
                      aria-label={`Remover ${d.name}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-baseline justify-between text-xs">
                  <span>
                    Saldo devedor: <strong className="text-base text-rose-600 dark:text-rose-400 money-value">{brl(d.current_balance)}</strong>
                  </span>
                  <span className="text-slate-500 money-value">
                    Parcela: <strong>{brl(d.monthly_payment)}</strong>
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Amortizado</span>
                    <span>{d.paid_pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${d.paid_pct}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Avalanche vs Bola de Neve Strategist */}
      {strategy && (
        <section className="glass-panel border-violet-400/35 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-500" aria-hidden="true" />
                Estrategista de Quitação: Avalanche vs Bola de Neve
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Simule quanto você economiza em juros e meses acelerando com um aporte extra mensal
              </p>
            </div>
            <div className="w-full sm:w-64">
              <label htmlFor="extra-debt-pmt" className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Aporte extra mensal: <strong>{brl(extraMonthly)}</strong>
              </label>
              <input
                id="extra-debt-pmt"
                type="range"
                min={0}
                max={5000}
                step={100}
                value={extraMonthly}
                onChange={(e) => setExtraMonthly(Number(e.target.value))}
                className="w-full accent-primary-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card p-4 border-emerald-400/50 space-y-2">
              <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" aria-hidden="true" />
                Método Avalanche (Maior Juros Primeiro)
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Prazo: <strong>{strategy.avalanche.months} meses</strong> · Juros totais:{' '}
                <strong className="money-value">{brl(strategy.avalanche.total_interest)}</strong>
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                Economiza {brl(strategy.interest_saved_with_extra)} e {strategy.months_saved_with_extra} meses com seu aporte extra!
              </p>
            </div>

            <div className="glass-card p-4 space-y-2">
              <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Snowflake className="w-4 h-4 text-sky-500" aria-hidden="true" />
                Método Bola de Neve (Menor Saldo Primeiro)
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Prazo: <strong>{strategy.snowball.months} meses</strong> · Juros totais:{' '}
                <strong className="money-value">{brl(strategy.snowball.total_interest)}</strong>
              </p>
              <p className="text-xs text-slate-500">
                Diferença de juros vs Avalanche: <strong className="money-value">{brl(strategy.interest_saved_vs_snowball)}</strong>
              </p>
            </div>
          </div>
        </section>
      )}

      {/* SAC vs Price Extra Amortization Simulator */}
      <section className="glass-panel space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Calculator className="w-5 h-5 text-blue-500" aria-hidden="true" />
          Simulador de Amortização Extraordinária (SAC vs Price)
        </h2>
        <form onSubmit={runAmort} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Saldo Devedor (R$)</label>
            <input type="number" value={simBal} onChange={(e) => setSimBal(Number(e.target.value))} className="input-base" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Taxa (% a.a.)</label>
            <input type="number" step="0.1" value={simRate} onChange={(e) => setSimRate(Number(e.target.value))} className="input-base" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Meses Restantes</label>
            <input type="number" value={simMonths} onChange={(e) => setSimMonths(Number(e.target.value))} className="input-base" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Amortização Extra (R$)</label>
            <input type="number" value={simExtra} onChange={(e) => setSimExtra(Number(e.target.value))} className="input-base" />
          </div>
          <button type="submit" className="liquid-btn liquid-btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold">
            Comparar
          </button>
        </form>

        {amort && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="glass-card p-4 space-y-1.5 text-xs">
              <p className="text-sm font-bold text-slate-900 dark:text-white">Tabela SAC (Parcelas Decrescentes)</p>
              <p>1ª Parcela: <strong className="money-value">{brl(amort.sac.first_installment)}</strong> → Última: <strong className="money-value">{brl(amort.sac.last_installment)}</strong></p>
              <p>Juros Totais: <strong className="money-value">{brl(amort.sac.total_interest)}</strong></p>
              <p className="text-emerald-600 dark:text-emerald-400 font-semibold">
                Amortizando {brl(simExtra)}: economiza {brl(amort.sac.interest_saved)} e reduz {amort.sac.months_saved} meses!
              </p>
            </div>
            <div className="glass-card p-4 space-y-1.5 text-xs">
              <p className="text-sm font-bold text-slate-900 dark:text-white">Tabela Price (Parcelas Fixas)</p>
              <p>Parcela Fixa: <strong className="money-value">{brl(amort.price.first_installment)}</strong></p>
              <p>Juros Totais: <strong className="money-value">{brl(amort.price.total_interest)}</strong></p>
              <p className="text-emerald-600 dark:text-emerald-400 font-semibold">
                Amortizando {brl(simExtra)}: economiza {brl(amort.price.interest_saved)} e reduz {amort.price.months_saved} meses!
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Add Debt Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <form onSubmit={handleCreateDebt} className="glass-modal max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Cadastrar Dívida / Financiamento</h2>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Fechar modal" className="p-1.5 rounded-lg text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1">Nome *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Financiamento Apartamento" className="input-base" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Tipo</label>
                <select value={form.debt_type} onChange={(e) => setForm({ ...form, debt_type: e.target.value })} className="input-base">
                  <option value="mortgage">Financiamento Imóvel</option>
                  <option value="vehicle">Financiamento Veículo</option>
                  <option value="personal_loan">Empréstimo Pessoal</option>
                  <option value="consortium">Consórcio</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Instituição / Credor</label>
                <input value={form.creditor} onChange={(e) => setForm({ ...form, creditor: e.target.value })} placeholder="Ex: Caixa, Itaú" className="input-base" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Valor Original (R$) *</label>
                <input type="number" step="0.01" required value={form.original_amount} onChange={(e) => setForm({ ...form, original_amount: e.target.value })} className="input-base" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Saldo Devedor Atual (R$) *</label>
                <input type="number" step="0.01" required value={form.current_balance} onChange={(e) => setForm({ ...form, current_balance: e.target.value })} className="input-base" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Juros (% ao mês)</label>
                <input type="number" step="0.01" value={form.interest_rate_monthly} onChange={(e) => setForm({ ...form, interest_rate_monthly: e.target.value })} className="input-base" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Parcela Mensal (R$)</label>
                <input type="number" step="0.01" value={form.monthly_payment} onChange={(e) => setForm({ ...form, monthly_payment: e.target.value })} className="input-base" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-sm font-semibold">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Amortize / Pay Installment Modal */}
      {amortizeDebt && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setAmortizeDebt(null)}
        >
          <form
            onSubmit={handleAmortizeSubmit}
            onClick={(e) => e.stopPropagation()}
            className="glass-modal max-w-sm w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Amortizar &ldquo;{amortizeDebt.name}&rdquo;
              </h3>
              <button type="button" onClick={() => setAmortizeDebt(null)} aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Saldo devedor atual: <strong className="money-value">{brl(amortizeDebt.current_balance)}</strong>
            </p>
            <div>
              <label className="block text-xs font-semibold mb-1">Valor pago / amortizado (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                value={amortizeAmount}
                onChange={(e) => setAmortizeAmount(e.target.value)}
                className="input-base text-sm font-bold"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAmortizeDebt(null)} className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-xs font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={amortizing} className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-xs font-semibold disabled:opacity-50">
                {amortizing ? 'Registrando...' : 'Confirmar Amortização'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Remover "${deleteTarget?.name || ''}"?`}
        description="A dívida será removida do seu cálculo de patrimônio líquido."
        confirmLabel="Remover"
        variant="danger"
        loading={deletingDebt}
        onConfirm={executeDeleteDebt}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

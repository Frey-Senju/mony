'use client'

import React, { useMemo, useState } from 'react'
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
import { Flame, CreditCard, CheckCircle2, Sparkles } from 'lucide-react'

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

export function FireSimulatorPanel() {
  const [monthlyExpense, setMonthlyExpense] = useState(5000)
  const [currentPatrimony, setCurrentPatrimony] = useState(40000)
  const [monthlySave, setMonthlySave] = useState(2000)
  const [realReturnAnnualPct, setRealReturnAnnualPct] = useState(6.0)
  const [withdrawalRatePct, setWithdrawalRatePct] = useState(4.0)

  const sim = useMemo(() => {
    const annualExpense = monthlyExpense * 12
    const fireNumber = withdrawalRatePct > 0 ? annualExpense / (withdrawalRatePct / 100) : annualExpense * 25
    const rMonthly = Math.pow(1 + realReturnAnnualPct / 100, 1 / 12) - 1

    const runCurve = (extraMonthly: number) => {
      let bal = currentPatrimony
      const points: Array<{ year: number; label: string; patrimony: number; fireTarget: number }> = [
        { year: 0, label: 'Hoje', patrimony: Math.round(bal), fireTarget: Math.round(fireNumber) },
      ]
      let reachedYear: number | null = bal >= fireNumber ? 0 : null
      const nowYear = new Date().getFullYear()
      for (let yr = 1; yr <= 40; yr++) {
        for (let m = 0; m < 12; m++) {
          bal = bal * (1 + rMonthly) + (monthlySave + extraMonthly)
        }
        if (reachedYear === null && bal >= fireNumber) {
          reachedYear = yr
        }
        points.push({
          year: yr,
          label: String(nowYear + yr),
          patrimony: Math.round(bal),
          fireTarget: Math.round(fireNumber),
        })
        if (reachedYear !== null && yr >= Math.min(40, reachedYear + 3)) break
      }
      return { points, reachedYear }
    }

    const base = runCurve(0)
    const boosted = runCurve(500)
    const yearsSavedBy500 =
      base.reachedYear !== null && boosted.reachedYear !== null
        ? Math.max(0, base.reachedYear - boosted.reachedYear)
        : 0

    const passiveIncomeNow = (currentPatrimony * (withdrawalRatePct / 100)) / 12
    const progressPct = fireNumber > 0 ? Math.min(100, (currentPatrimony / fireNumber) * 100) : 0

    return {
      fireNumber,
      points: base.points,
      reachedYear: base.reachedYear,
      targetCalendarYear: base.reachedYear !== null ? new Date().getFullYear() + base.reachedYear : null,
      yearsSavedBy500,
      passiveIncomeNow,
      progressPct,
    }
  }, [monthlyExpense, currentPatrimony, monthlySave, realReturnAnnualPct, withdrawalRatePct])

  return (
    <div className="space-y-5">
      <section className="glass-panel p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Simulador de Independência Financeira (FIRE)
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Descubra o patrimônio necessário para viver de renda passiva real (acima da inflação) e em que ano você chega lá
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="glass-card p-3 block">
            <span className="text-[11px] font-semibold text-slate-500">Custo de Vida / Mês (R$)</span>
            <input
              type="number"
              min="500"
              step="100"
              value={monthlyExpense}
              onChange={(e) => setMonthlyExpense(Math.max(0, Number(e.target.value)))}
              className="input-base mt-1 py-1.5 text-sm font-bold"
            />
          </label>
          <label className="glass-card p-3 block">
            <span className="text-[11px] font-semibold text-slate-500">Patrimônio Investido Hoje (R$)</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={currentPatrimony}
              onChange={(e) => setCurrentPatrimony(Math.max(0, Number(e.target.value)))}
              className="input-base mt-1 py-1.5 text-sm font-bold"
            />
          </label>
          <label className="glass-card p-3 block">
            <span className="text-[11px] font-semibold text-slate-500">Aporte Mensal (R$)</span>
            <input
              type="number"
              min="0"
              step="100"
              value={monthlySave}
              onChange={(e) => setMonthlySave(Math.max(0, Number(e.target.value)))}
              className="input-base mt-1 py-1.5 text-sm font-bold text-emerald-600 dark:text-emerald-400"
            />
          </label>
          <label className="glass-card p-3 block">
            <span className="text-[11px] font-semibold text-slate-500">Juro Real (% a.a. acima IPCA)</span>
            <input
              type="number"
              min="1"
              max="15"
              step="0.5"
              value={realReturnAnnualPct}
              onChange={(e) => setRealReturnAnnualPct(Math.max(0.5, Number(e.target.value)))}
              className="input-base mt-1 py-1.5 text-sm font-bold"
            />
          </label>
          <label className="glass-card p-3 block">
            <span className="text-[11px] font-semibold text-slate-500">Taxa Retirada Segura (% a.a.)</span>
            <input
              type="number"
              min="2"
              max="8"
              step="0.5"
              value={withdrawalRatePct}
              onChange={(e) => setWithdrawalRatePct(Math.max(1, Number(e.target.value)))}
              className="input-base mt-1 py-1.5 text-sm font-bold"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-4 border border-orange-500/25">
            <p className="text-xs text-slate-500">Seu Número FIRE</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums money-value">
              {brl(sim.fireNumber)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Progresso atual: <strong>{sim.progressPct.toFixed(1)}%</strong>
            </p>
          </div>

          <div className="glass-card p-4 border border-emerald-500/25">
            <p className="text-xs text-slate-500">Ano da Liberdade Financeira</p>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
              {sim.targetCalendarYear ?? '40+ anos'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {sim.reachedYear !== null ? `Em ${sim.reachedYear} ano(s)` : 'Aumente o aporte mensal'}
            </p>
          </div>

          <div className="glass-card p-4 border border-blue-500/25">
            <p className="text-xs text-slate-500">Renda Passiva Atual</p>
            <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1 tabular-nums money-value">
              {brl(sim.passiveIncomeNow)}/mês
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Meta: {brl(monthlyExpense)}/mês</p>
          </div>

          <div className="glass-card p-4 border border-violet-500/25">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              Efeito +R$ 500/mês
            </p>
            <p className="text-2xl font-extrabold text-violet-600 dark:text-violet-400 mt-1">
              {sim.yearsSavedBy500 > 0 ? `-${sim.yearsSavedBy500} ano(s)` : 'Acelera!'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Antecipação da aposentadoria</p>
          </div>
        </div>
      </section>

      <section className="glass-card p-6">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">
          Trajetória Real até a Independência Financeira (valores em poder de compra de hoje)
        </h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sim.points} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `R$${(Number(v) / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={72} />
              <Tooltip formatter={(v) => brl(Number(v || 0))} />
              <ReferenceLine
                y={sim.fireNumber}
                stroke="#f97316"
                strokeDasharray="5 5"
                label={{ value: 'Meta FIRE', position: 'insideTopRight', fill: '#f97316', fontSize: 11 }}
              />
              <Area
                type="monotone"
                dataKey="patrimony"
                name="Patrimônio Projetado"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.22}
                strokeWidth={2.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}

export function CashVsInstallmentPanel() {
  const [price, setPrice] = useState(2400)
  const [cashDiscountPct, setCashDiscountPct] = useState(8)
  const [installments, setInstallments] = useState(10)
  const [cdiAnnualPct, setCdiAnnualPct] = useState(11.25)

  const calc = useMemo(() => {
    const cashPrice = price * (1 - cashDiscountPct / 100)
    const installmentVal = installments > 0 ? price / installments : price
    // Net monthly CDI rate after 20% income tax (short-term CDB/Selic)
    const netAnnual = (cdiAnnualPct / 100) * 0.8
    const netMonthly = Math.pow(1 + netAnnual, 1 / 12) - 1

    // Present value of paying installments while keeping money invested in CDI
    let pvInstallments = 0
    for (let k = 1; k <= installments; k++) {
      pvInstallments += installmentVal / Math.pow(1 + netMonthly, k)
    }

    // Also simulate exact ending leftover if user starts with `price` in CDI and withdraws `installmentVal` monthly
    let balance = cashPrice
    for (let k = 1; k <= installments; k++) {
      balance = balance * (1 + netMonthly) - installmentVal
    }

    const cashWins = cashPrice < pvInstallments
    const advantage = Math.abs(pvInstallments - cashPrice)
    const breakEvenDiscountPct = price > 0 ? ((price - pvInstallments) / price) * 100 : 0

    return {
      cashPrice,
      installmentVal,
      pvInstallments,
      cashWins,
      advantage,
      breakEvenDiscountPct,
      endingBalanceIfInstallment: balance,
    }
  }, [price, cashDiscountPct, installments, cdiAnnualPct])

  return (
    <section className="glass-panel p-6 space-y-5">
      <div className="flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-blue-500" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            À Vista com Desconto × Parcelado no CDI
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Cálculo exato a Valor Presente considerando rendimento líquido do CDI (já descontando IR de 20%)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="glass-card p-3 block">
          <span className="text-[11px] font-semibold text-slate-500">Valor da Compra (R$)</span>
          <input
            type="number"
            min="1"
            step="10"
            value={price}
            onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
            className="input-base mt-1 py-1.5 text-sm font-bold"
          />
        </label>
        <label className="glass-card p-3 block">
          <span className="text-[11px] font-semibold text-slate-500">Desconto à Vista (%)</span>
          <input
            type="number"
            min="0"
            max="50"
            step="0.5"
            value={cashDiscountPct}
            onChange={(e) => setCashDiscountPct(Math.max(0, Number(e.target.value)))}
            className="input-base mt-1 py-1.5 text-sm font-bold text-emerald-600 dark:text-emerald-400"
          />
        </label>
        <label className="glass-card p-3 block">
          <span className="text-[11px] font-semibold text-slate-500">Nº de Parcelas sem juros</span>
          <input
            type="number"
            min="1"
            max="36"
            value={installments}
            onChange={(e) => setInstallments(Math.max(1, Math.min(36, Number(e.target.value))))}
            className="input-base mt-1 py-1.5 text-sm font-bold"
          />
        </label>
        <label className="glass-card p-3 block">
          <span className="text-[11px] font-semibold text-slate-500">Taxa CDI / Selic (% a.a.)</span>
          <input
            type="number"
            min="0"
            max="30"
            step="0.25"
            value={cdiAnnualPct}
            onChange={(e) => setCdiAnnualPct(Math.max(0, Number(e.target.value)))}
            className="input-base mt-1 py-1.5 text-sm font-bold"
          />
        </label>
      </div>

      {/* Verdict Banner */}
      <div
        className={`glass-card p-5 border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          calc.cashWins
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : 'border-blue-500/40 bg-blue-500/10'
        }`}
      >
        <div className="flex items-start gap-3">
          <CheckCircle2
            className={`w-6 h-6 shrink-0 mt-0.5 ${calc.cashWins ? 'text-emerald-500' : 'text-blue-500'}`}
            aria-hidden="true"
          />
          <div>
            <p className="text-base font-extrabold text-slate-900 dark:text-white">
              {calc.cashWins
                ? `Vale mais a pena PAGAR À VISTA — você economiza ${brl(calc.advantage)} líquidos!`
                : `Vale mais a pena PARCELAR em ${installments}× e deixar o dinheiro rendendo no CDI — ganho líquido de ${brl(calc.advantage)}!`}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Desconto mínimo para compensar pagar à vista em {installments}× com CDI a {cdiAnnualPct.toFixed(2).replace('.', ',')}%:{' '}
              <strong>{calc.breakEvenDiscountPct.toFixed(2).replace('.', ',')}%</strong>.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">Preço à Vista ({cashDiscountPct}% off)</p>
          <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
            {brl(calc.cashPrice)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Desconto nominal: {brl(price - calc.cashPrice)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">Parcelado ({installments}× sem juros)</p>
          <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
            {installments}× {brl(calc.installmentVal)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Total nominal: {brl(price)}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">Custo Real das Parcelas (VPL no CDI)</p>
          <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
            {brl(calc.pvInstallments)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Equivalente a hoje após rendimento líquido</p>
        </div>
      </div>
    </section>
  )
}

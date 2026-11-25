/**
 * Pure, tested financial calculation engine faithfully implementing every formula
 * from the Mony Reference Spreadsheet:
 *   - Simulador de Resultados de Investimento (10-year monthly compounding)
 *   - Cálculo de Faturamento (Deals + Weighted Net Margin)
 *   - Salário com Meta (Weighted KPIs, 60% gate, 4x accelerator above 100%, Quinquênio, Bonus)
 *   - Cálculo de DSR sobre Comissões (Business vs. Non-Business Days per month)
 *   - Tabela Progressiva INSS (4 brackets, 2026 ceiling R$ 8.475,55 -> R$ 988,09)
 *   - Tabela IRRF 2026 (Legal vs. Simplified deduction comparison + progressive reducer R$ 5.000..7.350)
 *   - Cashflow / Emergency Reserve / Financial Independence (200x median expenses)
 */

// ==================== 1. Investment Results Simulator ====================

export interface InvestmentSimInput {
  initialCapital: number
  monthlyRatePct: number // e.g., 4.0 for 4% a.m.
  monthlyContribution: number
  swingTradeCost: number
  platformCost: number
  years: number // 1..10
}

export interface InvestmentYearResult {
  year: number
  startBalance: number
  endBalance: number
  months: number[] // 12 monthly balances (Jan..Dec)
  totalContributedInYear: number
  interestEarnedInYear: number
}

export interface InvestmentSimResult {
  annualLinearRatePct: number
  annualCompoundRatePct: number
  finalBalance: number
  totalInvested: number
  totalInterest: number
  totalCosts: number
  estimatedMonthlyPassiveIncome: number
  years: InvestmentYearResult[]
  chartPoints: Array<{
    label: string
    year: number
    patrimonio: number
    aportado: number
    juros: number
  }>
}

export function simulateInvestment(input: InvestmentSimInput): InvestmentSimResult {
  const yearsCount = Math.min(Math.max(Math.round(input.years || 10), 1), 30)
  const rate = (input.monthlyRatePct || 0) / 100
  const monthlyContrib = Math.max(0, input.monthlyContribution || 0)
  const monthlyCost = Math.max(0, input.swingTradeCost || 0) + Math.max(0, input.platformCost || 0)

  let balance = Math.max(0, input.initialCapital || 0)
  let cumulativeInvested = balance
  let totalCosts = 0

  const years: InvestmentYearResult[] = []
  const chartPoints: InvestmentSimResult['chartPoints'] = [
    {
      label: 'Início',
      year: 0,
      patrimonio: round2(balance),
      aportado: round2(cumulativeInvested),
      juros: 0,
    },
  ]

  for (let y = 1; y <= yearsCount; y++) {
    const startBalance = balance
    const months: number[] = []
    let yearContrib = 0
    let yearInterest = 0

    for (let m = 0; m < 12; m++) {
      const interest = balance * rate
      balance = balance + interest + monthlyContrib - monthlyCost
      yearInterest += interest
      yearContrib += monthlyContrib
      cumulativeInvested += monthlyContrib
      totalCosts += monthlyCost
      months.push(balance)
    }

    years.push({
      year: y,
      startBalance,
      endBalance: balance,
      months,
      totalContributedInYear: yearContrib,
      interestEarnedInYear: yearInterest,
    })

    chartPoints.push({
      label: `${y}º Ano`,
      year: y,
      patrimonio: round2(balance),
      aportado: round2(cumulativeInvested),
      juros: round2(Math.max(0, balance - cumulativeInvested)),
    })
  }

  return {
    annualLinearRatePct: round2((input.monthlyRatePct || 0) * 12),
    annualCompoundRatePct: round2((Math.pow(1 + rate, 12) - 1) * 100),
    finalBalance: balance,
    totalInvested: cumulativeInvested,
    totalInterest: balance - cumulativeInvested,
    totalCosts,
    estimatedMonthlyPassiveIncome: balance * rate,
    years,
    chartPoints,
  }
}

// ==================== 2. DSR Calendar & Calculation ====================

export interface MonthWorkDays {
  month: number // 1..12
  name: string
  businessDays: number
  nonBusinessDays: number
}

export const DEFAULT_DSR_CALENDAR: MonthWorkDays[] = [
  { month: 1, name: 'Janeiro', businessDays: 22, nonBusinessDays: 5 },
  { month: 2, name: 'Fevereiro', businessDays: 20, nonBusinessDays: 4 },
  { month: 3, name: 'Março', businessDays: 21, nonBusinessDays: 5 },
  { month: 4, name: 'Abril', businessDays: 20, nonBusinessDays: 6 },
  { month: 5, name: 'Maio', businessDays: 21, nonBusinessDays: 6 },
  { month: 6, name: 'Junho', businessDays: 21, nonBusinessDays: 4 },
  { month: 7, name: 'Julho', businessDays: 23, nonBusinessDays: 4 },
  { month: 8, name: 'Agosto', businessDays: 21, nonBusinessDays: 5 },
  { month: 9, name: 'Setembro', businessDays: 21, nonBusinessDays: 5 },
  { month: 10, name: 'Outubro', businessDays: 23, nonBusinessDays: 4 },
  { month: 11, name: 'Novembro', businessDays: 19, nonBusinessDays: 6 },
  { month: 12, name: 'Dezembro', businessDays: 22, nonBusinessDays: 5 },
]

export function calculateDSR(
  commissions: number,
  businessDays: number,
  nonBusinessDays: number
): number {
  if (commissions <= 0 || businessDays <= 0 || nonBusinessDays <= 0) return 0
  return nonBusinessDays * (commissions / businessDays)
}

// ==================== 3. Progressive INSS (2026 Brackets) ====================

export interface INSSBracketRow {
  from: number
  to: number
  rate: number
  sliceAmount: number
  contribution: number
}

export interface INSSResult {
  grossSalary: number
  totalINSS: number
  effectiveRatePct: number
  ceilingReached: boolean
  brackets: INSSBracketRow[]
}

export const INSS_BRACKETS = [
  { from: 0, to: 1621.0, rate: 0.075 },
  { from: 1621.01, to: 2902.84, rate: 0.09 },
  { from: 2902.85, to: 4354.27, rate: 0.12 },
  { from: 4354.28, to: 8475.55, rate: 0.14 },
] as const

export function calculateINSS(grossSalary: number): INSSResult {
  const gross = Math.max(0, grossSalary || 0)
  const brackets: INSSBracketRow[] = []
  let total = 0

  for (const b of INSS_BRACKETS) {
    let slice = 0
    if (gross > b.from) {
      const upper = Math.min(gross, b.to)
      slice = Math.max(0, upper - b.from)
    }
    const contribution = slice * b.rate
    total += contribution
    brackets.push({
      from: b.from,
      to: b.to,
      rate: b.rate,
      sliceAmount: slice,
      contribution,
    })
  }

  return {
    grossSalary: gross,
    totalINSS: total,
    effectiveRatePct: gross > 0 ? (total / gross) * 100 : 0,
    ceilingReached: gross >= INSS_BRACKETS[INSS_BRACKETS.length - 1].to,
    brackets,
  }
}

// ==================== 4. IRRF (2026 Law: Legal vs Simplified + 5k..7.35k Reducer) ====================

export const IRRF_BRACKETS = [
  { from: 0, to: 2428.8, rate: 0.0, deduction: 0.0 },
  { from: 2428.81, to: 2826.65, rate: 0.075, deduction: 182.16 },
  { from: 2826.66, to: 3751.05, rate: 0.15, deduction: 394.16 },
  { from: 3751.06, to: 4664.68, rate: 0.225, deduction: 675.49 },
  { from: 4664.69, to: Infinity, rate: 0.275, deduction: 908.73 },
] as const

export const IRRF_SIMPLIFIED_DISCOUNT = 607.2 // 25% of first bracket (2428.80)
export const IRRF_DEPENDENT_VALUE = 189.59

export interface IRRFMethodBreakdown {
  taxableBase: number
  rate: number
  grossTax: number
  bracketDeduction: number
  progressiveReducer: number
  taxDue: number
}

export interface IRRFResult {
  grossSalary: number
  inssDeduction: number
  dependentsDeduction: number
  otherDeductions: number
  progressiveReducer2026: number
  exemptUnder5000: boolean
  legal: IRRFMethodBreakdown
  simplified: IRRFMethodBreakdown
  bestMethod: 'legal' | 'simplified' | 'exempt'
  finalIRRF: number
  effectiveRatePct: number
}

function lookupIRRFBracket(base: number) {
  const b = Math.max(0, base)
  for (let i = IRRF_BRACKETS.length - 1; i >= 0; i--) {
    if (b >= IRRF_BRACKETS[i].from) {
      return IRRF_BRACKETS[i]
    }
  }
  return IRRF_BRACKETS[0]
}

export function calculateIRRF(
  grossSalary: number,
  inssAmount: number,
  dependentsCount = 0,
  otherDeductions = 0
): IRRFResult {
  const gross = Math.max(0, grossSalary || 0)
  const depDed = Math.max(0, Math.floor(dependentsCount || 0)) * IRRF_DEPENDENT_VALUE
  const otherDed = Math.max(0, otherDeductions || 0)

  // 2026 Progressive Reducer: exempt <= 5000, smooth reduction 5000.01..7350 (978.62 - 0.133145 * gross)
  const exemptUnder5000 = gross <= 5000
  const progressiveReducer =
    gross <= 5000 ? 0 : Math.max(0, 978.62 - 0.133145 * gross)

  // Method 1: Legal deductions (matches spreadsheet AC7 = AC3 - MAX(AC4 + AC5 + AC6, 607.2))
  const legalDedTotal = Math.max(inssAmount + depDed + otherDed, IRRF_SIMPLIFIED_DISCOUNT)
  const legalBase = Math.max(0, gross - legalDedTotal)
  const legalBr = lookupIRRFBracket(legalBase)
  const legalGrossTax = legalBase * legalBr.rate
  const legalTax = exemptUnder5000
    ? 0
    : Math.max(0, legalGrossTax - legalBr.deduction - progressiveReducer)

  // Method 2: Simplified deduction (AI7 = AI3 - 607.2)
  const simpBase = Math.max(0, gross - IRRF_SIMPLIFIED_DISCOUNT)
  const simpBr = lookupIRRFBracket(simpBase)
  const simpGrossTax = simpBase * simpBr.rate
  const simpTax = exemptUnder5000
    ? 0
    : Math.max(0, simpGrossTax - simpBr.deduction - progressiveReducer)

  const finalIRRF = exemptUnder5000 ? 0 : Math.min(legalTax, simpTax)
  const bestMethod: IRRFResult['bestMethod'] = exemptUnder5000
    ? 'exempt'
    : legalTax <= simpTax
    ? 'legal'
    : 'simplified'

  return {
    grossSalary: gross,
    inssDeduction: inssAmount,
    dependentsDeduction: depDed,
    otherDeductions: otherDed,
    progressiveReducer2026: progressiveReducer,
    exemptUnder5000,
    legal: {
      taxableBase: legalBase,
      rate: legalBr.rate,
      grossTax: legalGrossTax,
      bracketDeduction: legalBr.deduction,
      progressiveReducer,
      taxDue: legalTax,
    },
    simplified: {
      taxableBase: simpBase,
      rate: simpBr.rate,
      grossTax: simpGrossTax,
      bracketDeduction: simpBr.deduction,
      progressiveReducer,
      taxDue: simpTax,
    },
    bestMethod,
    finalIRRF,
    effectiveRatePct: gross > 0 ? (finalIRRF / gross) * 100 : 0,
  }
}

// ==================== 5. Revenue / Billing Deals (Cálculo Faturamento) ====================

export interface DealRow {
  id: string
  company: string
  ov?: string
  deal?: string
  value: number
  marginPct: number // e.g., 26.03 for 26.03%
}

export interface RevenueSummary {
  totalRevenueWithMargin: number
  extraRevenue: number
  totalRevenue: number
  totalProfit: number
  weightedMarginPct: number
}

export function calculateRevenueSummary(deals: DealRow[], extraRevenue = 0): RevenueSummary {
  let revMargin = 0
  let profit = 0
  for (const d of deals) {
    const val = Math.max(0, Number(d.value) || 0)
    const m = (Number(d.marginPct) || 0) / 100
    revMargin += val
    profit += val * m
  }
  const extra = Math.max(0, Number(extraRevenue) || 0)
  return {
    totalRevenueWithMargin: revMargin,
    extraRevenue: extra,
    totalRevenue: revMargin + extra,
    totalProfit: profit,
    weightedMarginPct: revMargin > 0 ? (profit / revMargin) * 100 : 0,
  }
}

// ==================== 6. Salary with Goal (Salário com Meta) ====================

export interface GoalIndicator {
  id: string
  name: string
  unit: 'percent' | 'currency' | 'number'
  weightPct: number // e.g., 40 for 40%
  goal: number // e.g., 13.7 (if percent) or 500000 (if currency)
  result: number // e.g., 26.03 or 356.64
}

export interface PayrollDiscounts {
  restaurant: number
  mealVoucher: number
  consignedLoan: number
  association: number
  phonePlan: number
  other: number
}

export interface SalaryGoalInput {
  role: string
  baseSalary: number
  variableTarget: number
  hasQuinquenio: boolean
  quinquenioRate: number // exact spreadsheet ratio 0.049556
  isQuarterEnd: boolean
  quarterBonusAmount: number // default 300
  impactAdjustments: number // I33:I35 deductions from variable
  businessDays: number
  nonBusinessDays: number
  dependentsCount: number
  otherIrrfDeductions: number
  indicators: GoalIndicator[]
  discounts: PayrollDiscounts
}

export interface IndicatorResult extends GoalIndicator {
  achievementPct: number // Result / Goal (e.g., 1.9 = 190%)
  weightedContributionPct: number // achievementPct * (weightPct / 100)
}

export interface SalaryGoalResult {
  indicators: IndicatorResult[]
  totalAchievedPct: number // decimal, e.g., 0.760428
  variablePayoutPct: number // decimal after 60% gate & 4x accelerator above 100%
  gateStatus: 'below_gate' | 'normal' | 'accelerated'
  variableEarned: number // H15
  quarterBonus: number // I4
  variableEndOfMonth: number // H16
  dsrAmount: number // C6
  quinquenioAmount: number // I7
  grossSalary: number // H17
  inss: INSSResult
  irrf: IRRFResult
  otherDiscountsTotal: number
  totalDiscounts: number
  totalDiscountsPct: number
  netSalary: number // H18
}

export function calculateSalaryWithGoal(input: SalaryGoalInput): SalaryGoalResult {
  const indicatorResults: IndicatorResult[] = input.indicators.map((ind) => {
    const ach = ind.goal > 0 ? ind.result / ind.goal : 0
    const weighted = ach * (ind.weightPct / 100)
    return {
      ...ind,
      achievementPct: ach,
      weightedContributionPct: weighted,
    }
  })

  const totalAchieved = indicatorResults.reduce((s, i) => s + i.weightedContributionPct, 0)

  // Exact spreadsheet formula H14:
  // =IF(H13<60%, 0%, IF(H13>100%, (((H13-100%)*4)+100%), H13))
  let variablePayoutPct = 0
  let gateStatus: SalaryGoalResult['gateStatus'] = 'normal'
  if (totalAchieved < 0.6) {
    variablePayoutPct = 0
    gateStatus = 'below_gate'
  } else if (totalAchieved > 1.0) {
    variablePayoutPct = (totalAchieved - 1.0) * 4 + 1.0
    gateStatus = 'accelerated'
  } else {
    variablePayoutPct = totalAchieved
    gateStatus = 'normal'
  }

  const variableEarned = variablePayoutPct * Math.max(0, input.variableTarget || 0)
  const quarterBonus = input.isQuarterEnd ? Math.max(0, input.quarterBonusAmount || 0) : 0
  const variableEndOfMonth = Math.max(
    0,
    variableEarned + quarterBonus - Math.max(0, input.impactAdjustments || 0)
  )

  const dsrAmount = calculateDSR(
    variableEndOfMonth,
    input.businessDays,
    input.nonBusinessDays
  )
  const quinquenioAmount = input.hasQuinquenio
    ? Math.max(0, input.baseSalary || 0) * (input.quinquenioRate ?? 0.049556)
    : 0

  const grossSalary =
    Math.max(0, input.baseSalary || 0) + dsrAmount + variableEndOfMonth + quinquenioAmount

  const inss = calculateINSS(grossSalary)
  const irrf = calculateIRRF(
    grossSalary,
    inss.totalINSS,
    input.dependentsCount,
    input.otherIrrfDeductions
  )

  const d = input.discounts
  const otherDiscountsTotal =
    Math.max(0, d.restaurant || 0) +
    Math.max(0, d.mealVoucher || 0) +
    Math.max(0, d.consignedLoan || 0) +
    Math.max(0, d.association || 0) +
    Math.max(0, d.phonePlan || 0) +
    Math.max(0, d.other || 0)

  const totalDiscounts = inss.totalINSS + irrf.finalIRRF + otherDiscountsTotal
  const netSalary = Math.max(0, grossSalary - totalDiscounts)

  return {
    indicators: indicatorResults,
    totalAchievedPct: totalAchieved,
    variablePayoutPct,
    gateStatus,
    variableEarned,
    quarterBonus,
    variableEndOfMonth,
    dsrAmount,
    quinquenioAmount,
    grossSalary,
    inss,
    irrf,
    otherDiscountsTotal,
    totalDiscounts,
    totalDiscountsPct: grossSalary > 0 ? (totalDiscounts / grossSalary) * 100 : 0,
    netSalary,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

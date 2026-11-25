import {
  calculateDSR,
  calculateINSS,
  calculateIRRF,
  calculateRevenueSummary,
  calculateSalaryWithGoal,
  simulateInvestment,
} from '@/lib/calculators/financialEngine'

describe('Mony Financial Engine — Spreadsheet Fidelity', () => {
  it('reproduces the exact Salário com Meta + DSR + INSS + IRRF spreadsheet values to the cent', () => {
    const rev = calculateRevenueSummary([
      { id: '1', company: 'Cliente A', value: 356.64, marginPct: 26.03 },
    ])
    expect(rev.totalRevenue).toBeCloseTo(356.64, 2)
    expect(rev.weightedMarginPct).toBeCloseTo(26.03, 2)

    const result = calculateSalaryWithGoal({
      role: 'Vendedor Interno',
      baseSalary: 5150.0,
      variableTarget: 3433.33,
      hasQuinquenio: true,
      quinquenioRate: 0.049556,
      isQuarterEnd: true,
      quarterBonusAmount: 300,
      impactAdjustments: 0,
      businessDays: 19,
      nonBusinessDays: 6,
      dependentsCount: 0,
      otherIrrfDeductions: 0,
      indicators: [
        { id: 'margin', name: 'Margem Comercial', unit: 'percent', weightPct: 40, goal: 13.7, result: 26.03 },
        { id: 'volume', name: 'Volume de Vendas', unit: 'currency', weightPct: 60, goal: 500000, result: 356.64 },
      ],
      discounts: {
        restaurant: 0,
        mealVoucher: 133.0,
        consignedLoan: 0,
        association: 11.43,
        phonePlan: 32.0,
        other: 0,
      },
    })

    // Exact spreadsheet matches:
    expect(result.totalAchievedPct).toBeCloseTo(0.760428, 5)
    expect(result.variableEarned).toBeCloseTo(2610.8, 2)
    expect(result.variableEndOfMonth).toBeCloseTo(2910.8, 2)
    expect(result.dsrAmount).toBeCloseTo(919.2, 2)
    expect(result.quinquenioAmount).toBeCloseTo(255.21, 2)
    expect(result.grossSalary).toBeCloseTo(9235.21, 2)
    expect(result.inss.totalINSS).toBeCloseTo(988.09, 2)
    expect(result.irrf.legal.taxDue).toBeCloseTo(1359.23, 2)
    expect(result.irrf.simplified.taxDue).toBeCloseTo(1463.97, 2)
    expect(result.irrf.bestMethod).toBe('legal')
    expect(result.irrf.finalIRRF).toBeCloseTo(1359.23, 2)
    expect(result.netSalary).toBeCloseTo(6711.47, 2)
  })

  it('applies 60% variable gate and 4x accelerator above 100% correctly', () => {
    const below = calculateSalaryWithGoal({
      role: 'Vendedor',
      baseSalary: 3000,
      variableTarget: 2000,
      hasQuinquenio: false,
      quinquenioRate: 0.049556,
      isQuarterEnd: false,
      quarterBonusAmount: 0,
      impactAdjustments: 0,
      businessDays: 21,
      nonBusinessDays: 5,
      dependentsCount: 0,
      otherIrrfDeductions: 0,
      indicators: [
        { id: 'vol', name: 'Volume', unit: 'currency', weightPct: 100, goal: 100000, result: 55000 },
      ],
      discounts: { restaurant: 0, mealVoucher: 0, consignedLoan: 0, association: 0, phonePlan: 0, other: 0 },
    })
    expect(below.gateStatus).toBe('below_gate')
    expect(below.variableEarned).toBe(0)

    const above = calculateSalaryWithGoal({
      role: 'Vendedor',
      baseSalary: 3000,
      variableTarget: 2000,
      hasQuinquenio: false,
      quinquenioRate: 0.049556,
      isQuarterEnd: false,
      quarterBonusAmount: 0,
      impactAdjustments: 0,
      businessDays: 21,
      nonBusinessDays: 5,
      dependentsCount: 0,
      otherIrrfDeductions: 0,
      indicators: [
        { id: 'vol', name: 'Volume', unit: 'currency', weightPct: 100, goal: 100000, result: 110000 },
      ],
      discounts: { restaurant: 0, mealVoucher: 0, consignedLoan: 0, association: 0, phonePlan: 0, other: 0 },
    })
    // 110% -> ((1.10 - 1.00) * 4) + 1.00 = 140% -> 2000 * 1.4 = 2800
    expect(above.gateStatus).toBe('accelerated')
    expect(above.variablePayoutPct).toBeCloseTo(1.4, 5)
    expect(above.variableEarned).toBeCloseTo(2800, 2)
  })

  it('applies 2026 IRRF exemption <= R$ 5.000 and progressive reducer between 5.000 and 7.350', () => {
    const inss4800 = calculateINSS(4800)
    const irrf4800 = calculateIRRF(4800, inss4800.totalINSS)
    expect(irrf4800.exemptUnder5000).toBe(true)
    expect(irrf4800.finalIRRF).toBe(0)

    const inss6000 = calculateINSS(6000)
    const irrf6000 = calculateIRRF(6000, inss6000.totalINSS)
    expect(irrf6000.progressiveReducer2026).toBeCloseTo(978.62 - 0.133145 * 6000, 2)
    expect(irrf6000.finalIRRF).toBeGreaterThanOrEqual(0)
  })

  it('reproduces the exact 10-year Investment Simulator spreadsheet values', () => {
    const sim = simulateInvestment({
      initialCapital: 15000,
      monthlyRatePct: 4.0,
      monthlyContribution: 5000,
      swingTradeCost: 0,
      platformCost: 0,
      years: 10,
    })
    expect(sim.annualLinearRatePct).toBe(48)
    expect(sim.years[0].months[0]).toBeCloseTo(20600, 2)
    expect(sim.years[0].endBalance).toBeCloseTo(99144.51, 2)
    expect(sim.years[1].endBalance).toBeCloseTo(233862.58, 2)
    expect(sim.years[9].endBalance).toBeCloseTo(15367758.51, 2)
  })

  it('calculates DSR accurately', () => {
    expect(calculateDSR(2910.8, 19, 6)).toBeCloseTo(919.2, 2)
  })
})

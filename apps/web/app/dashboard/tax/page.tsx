'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  FileSpreadsheet,
  Copy,
  CheckCircle2,
  Calculator,
  Landmark,
  Coins,
  Download,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { useAuth } from '@/stores/auth/useAuth'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type TaxTab = 'bens' | 'proventos' | 'darf'

interface BemItem {
  id: string
  ticker: string
  name: string
  asset_class: string
  grupo: string
  grupo_label: string
  codigo: string
  codigo_label: string
  quantity: number
  average_price: number
  total_cost: number
  broker?: string | null
  discriminacao: string
}

interface ProventoItem {
  ticker: string
  name: string
  codigo: string
  codigo_label: string
  total: number
  payments_count: number
}

interface DarfResult {
  asset_class: string
  trade_mode: string
  darf_code: string
  due_date: string
  tax_rate_pct: number
  total_sales: number
  total_cost: number
  fees: number
  gross_profit: number
  is_exempt: boolean
  exemption_reason?: string | null
  prior_loss_used: number
  taxable_base: number
  gross_tax: number
  irrf_deducted: number
  darf_amount: number
  must_pay_darf: boolean
  accumulated_below_min_10: boolean
  next_accumulated_loss: number
  status_label: string
  month?: number
  ym?: string
}

interface IrpfPayload {
  year: number
  summary: {
    total_bens_e_direitos: number
    bens_count: number
    total_rendimentos_isentos: number
    total_tributacao_exclusiva: number
    total_darf_year: number
    total_exempt_swing_profit: number
    accumulated_losses_end_of_year: Record<string, number>
  }
  bens_e_direitos: BemItem[]
  rendimentos_isentos: ProventoItem[]
  tributacao_exclusiva: ProventoItem[]
  monthly_darf: DarfResult[]
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

export default function TaxIrpfPage() {
  return (
    <PrivateRoute>
      <TaxIrpfContent />
    </PrivateRoute>
  )
}

function TaxIrpfContent() {
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const currentYear = new Date().getFullYear()

  const [year, setYear] = useState<number>(currentYear)
  const [tab, setTab] = useState<TaxTab>('bens')
  const [data, setData] = useState<IrpfPayload | null>(null)
  const [loading, setLoading] = useState(true)

  // Interactive DARF Simulator state
  const [simClass, setSimClass] = useState<'stock' | 'fii' | 'etf' | 'bdr' | 'crypto'>('stock')
  const [simMode, setSimMode] = useState<'swing' | 'day'>('swing')
  const [simSales, setSimSales] = useState('25000')
  const [simCost, setSimCost] = useState('19500')
  const [simFees, setSimFees] = useState('35')
  const [simLoss, setSimLoss] = useState('0')
  const [simIrrf, setSimIrrf] = useState('1.25')
  const [simResult, setSimResult] = useState<DarfResult | null>(null)
  const [simLoading, setSimLoading] = useState(false)

  const loadSummary = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/tax/irpf-summary?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [token, year])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  const copyText = (txt: string, label: string) => {
    navigator.clipboard?.writeText(txt).then(() => {
      dispatchToast(`${label} copiado para a área de transferência!`, 'success')
    }).catch(() => undefined)
  }

  const exportBensCsv = () => {
    if (!data) return
    const header = ['Grupo', 'Codigo', 'Ticker', 'Ativo', 'Quantidade', 'Preco_Medio', 'Custo_Total', 'Discriminacao']
    const rows = data.bens_e_direitos.map((b) => [
      b.grupo,
      b.codigo,
      b.ticker,
      `"${b.name.replace(/"/g, '""')}"`,
      String(b.quantity),
      String(b.average_price),
      String(b.total_cost),
      `"${b.discriminacao.replace(/"/g, '""')}"`,
    ])
    const csv = [header.join(';'), ...rows.map((r) => r.join(';'))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mony-irpf-bens-e-direitos-${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
    dispatchToast(`Relatório IRPF ${year} exportado em CSV!`, 'success')
  }

  const runDarfSim = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSimLoading(true)
    try {
      const res = await fetch(`${API_URL}/tax/darf-simulate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_class: simClass,
          trade_mode: simMode,
          total_sales: Number(simSales) || 0,
          total_cost: Number(simCost) || 0,
          fees: Number(simFees) || 0,
          prior_accumulated_loss: Number(simLoss) || 0,
          irrf_withheld: Number(simIrrf) || 0,
          reference_year: year,
        }),
      })
      if (res.ok) setSimResult(await res.json())
    } finally {
      setSimLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <header className="glass-panel p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
              style={{ background: 'var(--accent)' }}
            >
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                IRPF &amp; DARF B3 Automático
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Fichas Bens e Direitos prontas para copiar, Dividendos/JCP separados por código e Calculadora de DARF (isenção R$ 20k)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              aria-label="Ano-calendário IRPF"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="liquid-input text-xs font-bold py-2"
            >
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <option key={y} value={y}>
                  Ano-Calendário {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={exportBensCsv}
              disabled={!data}
              className="liquid-btn liquid-btn-primary px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Segmented tabs */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/40 dark:border-white/10" role="tablist">
          {(
            [
              { id: 'bens', label: 'Bens e Direitos', icon: Landmark },
              { id: 'proventos', label: 'Dividendos (Isentos) & JCP', icon: Coins },
              { id: 'darf', label: 'Calculadora & Apuração DARF', icon: Calculator },
            ] as const
          ).map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                  tab === t.id
                    ? 'liquid-nav-active shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
      </header>

      {/* KPI Summary Strip */}
      {data && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="glass-card p-4">
            <p className="text-[11px] font-semibold text-slate-500">Bens e Direitos ({data.summary.bens_count})</p>
            <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1 money-value">
              {brl(data.summary.total_bens_e_direitos)}
            </p>
            <p className="text-[10px] text-slate-400">Custo de aquisição + contas ≥ R$ 140</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-[11px] font-semibold text-slate-500">Rendimentos Isentos</p>
            <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 money-value">
              {brl(data.summary.total_rendimentos_isentos)}
            </p>
            <p className="text-[10px] text-slate-400">Dividendos (Cód. 09) e FIIs (Cód. 26)</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-[11px] font-semibold text-slate-500">Tributação Exclusiva (JCP)</p>
            <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1 money-value">
              {brl(data.summary.total_tributacao_exclusiva)}
            </p>
            <p className="text-[10px] text-slate-400">Código 10 — IR retido na fonte</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-[11px] font-semibold text-slate-500">DARF Apurado ({year})</p>
            <p className="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-1 money-value">
              {brl(data.summary.total_darf_year)}
            </p>
            <p className="text-[10px] text-slate-400">
              Lucro isento ≤ 20k: {brl(data.summary.total_exempt_swing_profit)}
            </p>
          </div>
        </section>
      )}

      {loading && <div className="h-44 glass-panel animate-pulse" />}

      {/* TAB 1: BENS E DIREITOS */}
      {!loading && data && tab === 'bens' && (
        <section className="glass-panel p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Ficha Bens e Direitos — Pronta para Copiar no Programa IRPF
              </h2>
              <p className="text-xs text-slate-500">
                Os valores seguem o custo médio de aquisição (regra oficial da Receita Federal), nunca a cotação de mercado.
              </p>
            </div>
          </div>

          {data.bens_e_direitos.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Nenhum ativo B3 ou conta bancária ≥ R$ 140 encontrada ainda. Cadastre sua carteira em Investimentos para gerar as fichas automaticamente.
            </p>
          ) : (
            <div className="space-y-3">
              {data.bens_e_direitos.map((b) => (
                <div key={b.id} className="glass-card p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300">
                        Grupo {b.grupo} · Cód. {b.codigo}
                      </span>
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {b.ticker} — {b.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-slate-900 dark:text-white money-value">
                        {brl(b.total_cost)}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText(b.discriminacao, `Discriminação de ${b.ticker}`)}
                        className="liquid-btn liquid-btn-glass px-2.5 py-1.5 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copiar
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">{b.grupo_label} → {b.codigo_label}</p>
                  <p className="text-xs p-2.5 rounded-xl bg-white/55 dark:bg-white/5 text-slate-700 dark:text-slate-200 font-mono">
                    {b.discriminacao}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: PROVENTOS (DIVIDENDOS ISENTOS & JCP) */}
      {!loading && data && tab === 'proventos' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="glass-panel p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Rendimentos Isentos e Não Tributáveis
            </h2>
            <p className="text-xs text-slate-500">Dividendos de Ações (Cód. 09) e Rendimentos de FIIs (Cód. 26) recebidos em {year}.</p>
            {data.rendimentos_isentos.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">Nenhum dividendo isento registrado em {year}.</p>
            ) : (
              <div className="space-y-2">
                {data.rendimentos_isentos.map((item) => (
                  <div key={`${item.ticker}-${item.codigo}`} className="glass-card p-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {item.ticker} <span className="text-emerald-600 font-semibold">· Cód. {item.codigo}</span>
                      </p>
                      <p className="text-[11px] text-slate-500">{item.payments_count} pagamento(s) · {item.codigo_label}</p>
                    </div>
                    <strong className="text-sm text-emerald-600 dark:text-emerald-400 money-value">{brl(item.total)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="glass-panel p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Coins className="w-4 h-4 text-blue-500" />
              Rendimentos Sujeitos à Tributação Exclusiva (JCP)
            </h2>
            <p className="text-xs text-slate-500">Juros sobre Capital Próprio (Cód. 10) recebidos em {year} (15% retido na fonte).</p>
            {data.tributacao_exclusiva.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">Nenhum JCP registrado em {year}.</p>
            ) : (
              <div className="space-y-2">
                {data.tributacao_exclusiva.map((item) => (
                  <div key={item.ticker} className="glass-card p-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {item.ticker} <span className="text-blue-600 font-semibold">· Cód. 10</span>
                      </p>
                      <p className="text-[11px] text-slate-500">{item.payments_count} pagamento(s)</p>
                    </div>
                    <strong className="text-sm text-blue-600 dark:text-blue-400 money-value">{brl(item.total)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: DARF SIMULATOR & MONTHLY APURAÇÃO */}
      {!loading && data && tab === 'darf' && (
        <div className="space-y-5">
          <section className="glass-panel p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Calculadora Interativa de DARF (Código 6015 / 4600)
              </h2>
              <p className="text-xs text-slate-500">
                Aplica automaticamente isenção de R$ 20.000/mês em Ações Swing Trade, R$ 35.000/mês em Cripto, alíquota de 20% para FIIs/Day Trade e compensação de prejuízo acumulado.
              </p>
            </div>

            <form onSubmit={runDarfSim} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Classe</label>
                <select
                  value={simClass}
                  onChange={(e) => setSimClass(e.target.value as 'stock' | 'fii' | 'etf' | 'bdr' | 'crypto')}
                  className="liquid-input text-xs w-full"
                >
                  <option value="stock">Ações B3 (15% / isento ≤ 20k)</option>
                  <option value="fii">FIIs (20% sem isenção)</option>
                  <option value="etf">ETFs (15%)</option>
                  <option value="bdr">BDRs (15%)</option>
                  <option value="crypto">Cripto (15% / isento ≤ 35k)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Operação</label>
                <select
                  value={simMode}
                  onChange={(e) => setSimMode(e.target.value as 'swing' | 'day')}
                  className="liquid-input text-xs w-full"
                >
                  <option value="swing">Swing Trade (normal)</option>
                  <option value="day">Day Trade (20%)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Total Vendas no Mês (R$)</label>
                <input type="number" step="0.01" value={simSales} onChange={(e) => setSimSales(e.target.value)} className="liquid-input text-xs w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Custo Médio Total (R$)</label>
                <input type="number" step="0.01" value={simCost} onChange={(e) => setSimCost(e.target.value)} className="liquid-input text-xs w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Taxas / Emolumentos (R$)</label>
                <input type="number" step="0.01" value={simFees} onChange={(e) => setSimFees(e.target.value)} className="liquid-input text-xs w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Prejuízo Acumulado Anterior (R$)</label>
                <input type="number" step="0.01" value={simLoss} onChange={(e) => setSimLoss(e.target.value)} className="liquid-input text-xs w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">IRRF Dedo-Duro Retido (R$)</label>
                <input type="number" step="0.01" value={simIrrf} onChange={(e) => setSimIrrf(e.target.value)} className="liquid-input text-xs w-full" />
              </div>
              <button
                type="submit"
                disabled={simLoading}
                className="liquid-btn liquid-btn-primary py-2.5 px-4 rounded-xl text-xs font-semibold disabled:opacity-50"
              >
                {simLoading ? 'Calculando...' : 'Calcular DARF'}
              </button>
            </form>

            {simResult && (
              <div
                className={`glass-card p-4 space-y-2 border ${
                  simResult.is_exempt
                    ? 'border-emerald-400/50 bg-emerald-500/8'
                    : simResult.must_pay_darf
                    ? 'border-rose-400/50 bg-rose-500/8'
                    : 'border-blue-400/40'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {simResult.is_exempt ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    )}
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white">{simResult.status_label}</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/70 dark:bg-white/10">
                    Cód. DARF {simResult.darf_code} · Venc. {simResult.due_date}
                  </span>
                </div>
                {simResult.exemption_reason && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">{simResult.exemption_reason}</p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 text-xs">
                  <div>
                    <span className="text-slate-500 block">Lucro/Prejuízo</span>
                    <strong className="money-value">{brl(simResult.gross_profit)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Prejuízo Compensado</span>
                    <strong className="money-value">{brl(simResult.prior_loss_used)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Base Tributável</span>
                    <strong className="money-value">{brl(simResult.taxable_base)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Alíquota / IRRF</span>
                    <strong>{simResult.tax_rate_pct}% / -{brl(simResult.irrf_deducted)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">DARF a Pagar</span>
                    <strong className="text-base text-rose-600 dark:text-rose-400 money-value">{brl(simResult.darf_amount)}</strong>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="glass-panel p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Apuração Automática de Vendas Registradas em {year}
            </h2>
            {data.monthly_darf.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                Nenhuma venda de renda variável registrada em {year}. Quando você registrar vendas na aba Investimentos, a apuração mensal de DARF aparecerá aqui automaticamente.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200/70 dark:border-white/10">
                      <th className="py-2 pr-3">Mês</th>
                      <th className="py-2 pr-3">Classe</th>
                      <th className="py-2 pr-3">Vendas</th>
                      <th className="py-2 pr-3">Resultado</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 text-right">DARF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthly_darf.map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-100/70 dark:border-white/5">
                        <td className="py-2.5 pr-3 font-bold">{row.ym}</td>
                        <td className="py-2.5 pr-3 uppercase">{row.asset_class}</td>
                        <td className="py-2.5 pr-3 money-value">{brl(row.total_sales)}</td>
                        <td className={`py-2.5 pr-3 font-semibold money-value ${row.gross_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {brl(row.gross_profit)}
                        </td>
                        <td className="py-2.5 pr-3">{row.status_label}</td>
                        <td className="py-2.5 text-right font-extrabold money-value">{brl(row.darf_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

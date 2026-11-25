'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Plus,
  Upload,
  Landmark,
  Coins,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Search,
  Layers,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { useAuth } from '@/stores/auth/useAuth'
import {
  PerformancePanel,
  RebalancePanel,
  DividendCalendarPanel,
  TaxReportPanel,
} from '@/components/investments/InvestmentsProPanels'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface PortfolioSummary {
  total_value: number
  total_cost: number
  total_gain: number
  total_gain_pct: number
  day_change_value: number
  day_change_pct: number
  dividends_12m: number
  dividends_total: number
  monthly_avg_dividends: number
  yield_on_cost_pct: number
  assets_count: number
  cdi_annual_pct: number
  ipca_annual_pct: number
}

interface EnrichedAsset {
  id: string
  ticker: string
  name: string
  asset_class: string
  asset_class_label: string
  sector: string
  broker?: string | null
  quantity: number
  average_price: number
  cost_total: number
  current_price: number
  current_value: number
  day_change_pct: number
  gain_value: number
  gain_pct: number
  dy_12m?: number | null
  pe_ratio?: number | null
  pvp_ratio?: number | null
  dividends_12m: number
  yoc_pct: number
  logo_url?: string | null
  quote_source: string
  indexer?: string | null
  indexer_rate?: number | null
  maturity_date?: string | null
  portfolio_pct: number
}

interface PortfolioData {
  summary: PortfolioSummary
  allocation_by_class: Array<{ asset_class: string; label: string; value: number; pct: number; count: number }>
  allocation_by_sector: Array<{ sector: string; value: number; pct: number }>
  monthly_dividends_12m: Array<{ ym: string; label: string; total: number }>
  assets: EnrichedAsset[]
}

interface TradeRow {
  id: string
  ticker: string
  asset_name: string
  operation: string
  trade_date: string
  quantity: number
  unit_price: number
  fees: number
  total: number
  broker?: string | null
}

interface DividendRow {
  id: string
  ticker: string
  asset_name: string
  dividend_type: string
  payment_date: string
  total_amount: number
  notes?: string | null
}

const PIE_COLORS = ['#0071E3', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4']

const CLASS_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'stock', label: 'Ações BR' },
  { id: 'fii', label: 'FIIs' },
  { id: 'etf', label: 'ETFs' },
  { id: 'bdr', label: 'BDRs' },
  { id: 'fixed_income', label: 'Renda Fixa' },
  { id: 'crypto', label: 'Cripto' },
]

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

function pct(v: number): string {
  const sign = v > 0 ? '+' : ''
  return `${sign}${(v || 0).toFixed(2).replace('.', ',')}%`
}

export default function InvestmentsPage() {
  return (
    <PrivateRoute>
      <InvestmentsContent />
    </PrivateRoute>
  )
}

function InvestmentsContent() {
  const { tokens } = useAuth()
  const token = tokens?.access_token

  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)
  const [trades, setTrades] = useState<TradeRow[]>([])
  const [dividends, setDividends] = useState<DividendRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncingPluggy, setSyncingPluggy] = useState(false)
  const [importingB3, setImportingB3] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [viewTab, setViewTab] = useState<
    'assets' | 'performance' | 'rebalance' | 'calendar' | 'tax' | 'dividends' | 'trades'
  >('assets')
  const [classFilter, setClassFilter] = useState('all')
  const b3InputRef = useRef<HTMLInputElement>(null)

  // Modal: Trade (Buy/Sell/Split/Bonus)
  const [tradeModalOpen, setTradeModalOpen] = useState(false)
  const [quotePreview, setQuotePreview] = useState<{ found: boolean; name?: string; price?: number; asset_class?: string } | null>(null)
  const [tradeForm, setTradeForm] = useState({
    ticker: '',
    name: '',
    asset_class: '',
    operation: 'buy' as 'buy' | 'sell' | 'bonus' | 'split',
    trade_date: new Date().toISOString().slice(0, 10),
    quantity: '',
    unit_price: '',
    fees: '0',
    broker: '',
  })

  // Modal: Direct Fixed Income
  const [fixedModalOpen, setFixedModalOpen] = useState(false)
  const [fixedForm, setFixedForm] = useState({
    ticker: 'CDB-110CDI',
    name: 'CDB 110% CDI',
    quantity: '1',
    average_price: '',
    indexer: 'CDI',
    indexer_rate: '110',
    maturity_date: '',
    broker: '',
  })

  // Modal: Dividend
  const [divModalOpen, setDivModalOpen] = useState(false)
  const [divForm, setDivForm] = useState({
    ticker: '',
    dividend_type: 'dividend' as 'dividend' | 'jcp' | 'fii_yield' | 'amortization',
    payment_date: new Date().toISOString().slice(0, 10),
    total_amount: '',
    notes: '',
  })

  const [submitting, setSubmitting] = useState(false)

  const loadAll = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [pRes, tRes, dRes] = await Promise.all([
        fetch(`${API_URL}/investments/portfolio`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/investments/trades`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/investments/dividends`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (pRes.ok) setPortfolio(await pRes.json())
      if (tRes.ok) setTrades(await tRes.json())
      if (dRes.ok) setDividends(await dRes.json())
    } catch {
      setError('Falha ao carregar carteira de investimentos.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Live B3 ticker lookup while typing in trade modal
  const lookupTicker = async () => {
    if (!token || tradeForm.ticker.trim().length < 4) return
    try {
      const res = await fetch(
        `${API_URL}/investments/quote/${encodeURIComponent(tradeForm.ticker.trim().toUpperCase())}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        const q = await res.json()
        setQuotePreview(q)
        if (q.found) {
          setTradeForm((prev) => ({
            ...prev,
            name: prev.name || q.name || prev.ticker.toUpperCase(),
            asset_class: prev.asset_class || q.asset_class || 'stock',
            unit_price: prev.unit_price || (q.price ? String(Number(q.price).toFixed(2)) : ''),
          }))
        }
      }
    } catch {
      // ignore
    }
  }

  const handleRefreshQuotes = async () => {
    if (!token) return
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/investments/refresh-quotes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Falha ao atualizar cotações B3')
      const data = await res.json()
      setBanner(`Cotações B3 atualizadas (${data.refreshed} ativo(s) sincronizado(s) ao vivo).`)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar cotações')
    } finally {
      setRefreshing(false)
    }
  }

  const handleSyncPluggy = async () => {
    if (!token) return
    setSyncingPluggy(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/investments/sync-pluggy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('Falha ao sincronizar corretoras via Pluggy')
      const d = await res.json()
      setBanner(`${d.positions_synced} posição(ões) sincronizada(s) via Open Finance / Pluggy (${d.positions_created} nova(s)).`)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar')
    } finally {
      setSyncingPluggy(false)
    }
  }

  const handleImportB3 = async (file: File) => {
    if (!token) return
    setImportingB3(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API_URL}/investments/import-b3`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Não foi possível importar o arquivo B3')
      }
      const d = await res.json()
      setBanner(
        `Extrato B3 importado: ${d.trades_imported} operação(ões), ${d.dividends_imported} provento(s) · ${d.duplicates_skipped} duplicata(s) ignorada(s).`
      )
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na importação B3')
    } finally {
      setImportingB3(false)
    }
  }

  const submitTrade = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/investments/trades`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: tradeForm.ticker.trim().toUpperCase(),
          name: tradeForm.name.trim() || undefined,
          asset_class: tradeForm.asset_class || undefined,
          operation: tradeForm.operation,
          trade_date: tradeForm.trade_date,
          quantity: parseFloat(tradeForm.quantity.replace(',', '.')),
          unit_price: parseFloat(tradeForm.unit_price.replace(',', '.')) || 0,
          fees: parseFloat(tradeForm.fees.replace(',', '.')) || 0,
          broker: tradeForm.broker.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao registrar operação')
      }
      setTradeModalOpen(false)
      setQuotePreview(null)
      setBanner(`Operação registrada em ${tradeForm.ticker.toUpperCase()} — preço médio recalculado!`)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar operação')
    } finally {
      setSubmitting(false)
    }
  }

  const submitFixedIncome = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/investments/assets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: fixedForm.ticker.trim().toUpperCase(),
          name: fixedForm.name.trim(),
          asset_class: 'fixed_income',
          quantity: parseFloat(fixedForm.quantity) || 1,
          average_price: parseFloat(fixedForm.average_price.replace(',', '.')),
          indexer: fixedForm.indexer,
          indexer_rate: parseFloat(fixedForm.indexer_rate.replace(',', '.')) || null,
          maturity_date: fixedForm.maturity_date || null,
          broker: fixedForm.broker.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('Erro ao cadastrar Renda Fixa')
      setFixedModalOpen(false)
      setBanner(`Renda Fixa "${fixedForm.name}" adicionada à carteira!`)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar Renda Fixa')
    } finally {
      setSubmitting(false)
    }
  }

  const submitDividend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/investments/dividends`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: divForm.ticker.trim().toUpperCase(),
          dividend_type: divForm.dividend_type,
          payment_date: divForm.payment_date,
          total_amount: parseFloat(divForm.total_amount.replace(',', '.')),
          notes: divForm.notes.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error('Erro ao lançar provento')
      setDivModalOpen(false)
      setBanner(`Provento registrado para ${divForm.ticker.toUpperCase()}!`)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar provento')
    } finally {
      setSubmitting(false)
    }
  }

  const deleteAsset = async (asset: EnrichedAsset) => {
    if (!token || !confirm(`Remover ${asset.ticker} da sua carteira?`)) return
    await fetch(`${API_URL}/investments/assets/${asset.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    await loadAll()
  }

  const deleteTrade = async (id: string) => {
    if (!token || !confirm('Remover esta operação e recalcular o preço médio?')) return
    await fetch(`${API_URL}/investments/trades/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    await loadAll()
  }

  const deleteDividend = async (id: string) => {
    if (!token || !confirm('Remover este provento?')) return
    await fetch(`${API_URL}/investments/dividends/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    await loadAll()
  }

  const s = portfolio?.summary
  const filteredAssets = (portfolio?.assets || []).filter(
    (a) => classFilter === 'all' || a.asset_class === classFilter
  )

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <header className="glass-panel flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
              style={{ background: 'var(--accent)' }}
              aria-hidden="true"
            >
              <TrendingUp className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                Carteira de Investimentos · B3
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Ações, FIIs, ETFs, BDRs & Renda Fixa com cotações B3 automáticas, preço médio, P/L, P/VP e proventos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={b3InputRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleImportB3(f)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={handleRefreshQuotes}
              disabled={refreshing}
              className="liquid-btn liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar B3
            </button>
            <button
              type="button"
              onClick={() => b3InputRef.current?.click()}
              disabled={importingB3}
              className="liquid-btn liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            >
              <Upload className="w-3.5 h-3.5" />
              {importingB3 ? 'Importando...' : 'Importar B3 (.xlsx/.csv)'}
            </button>
            <button
              type="button"
              onClick={handleSyncPluggy}
              disabled={syncingPluggy}
              className="liquid-btn liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            >
              <Landmark className="w-3.5 h-3.5" />
              {syncingPluggy ? 'Sincronizando...' : 'Sync Corretoras'}
            </button>
            <button
              type="button"
              onClick={() => setFixedModalOpen(true)}
              className="liquid-btn liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            >
              <Layers className="w-3.5 h-3.5" />
              + Renda Fixa
            </button>
            <button
              type="button"
              onClick={() => {
                setDivForm((prev) => ({
                  ...prev,
                  ticker: portfolio?.assets[0]?.ticker || '',
                }))
                setDivModalOpen(true)
              }}
              className="liquid-btn liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            >
              <Coins className="w-3.5 h-3.5" />
              + Provento
            </button>
            <button
              type="button"
              onClick={() => {
                setQuotePreview(null)
                setTradeForm({
                  ticker: '',
                  name: '',
                  asset_class: '',
                  operation: 'buy',
                  trade_date: new Date().toISOString().slice(0, 10),
                  quantity: '',
                  unit_price: '',
                  fees: '0',
                  broker: '',
                })
                setTradeModalOpen(true)
              }}
              className="liquid-btn liquid-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              Lançar Operação
            </button>
          </div>
        </div>
      </header>

      {banner && (
        <div role="status" className="glass-card p-3.5 border-emerald-400/50 flex items-center justify-between text-sm text-emerald-700 dark:text-emerald-300">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {banner}
          </span>
          <button type="button" onClick={() => setBanner(null)} aria-label="Fechar aviso">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="glass-card p-3.5 border-rose-400/50 flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 5 Consolidated KPI Cards (Investidor10 Style) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Patrimônio Total</p>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
            {brl(s?.total_value || 0)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">{s?.assets_count || 0} ativo(s) em custódia</p>
        </div>

        <div className="glass-card p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Aplicado (Custo)</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {brl(s?.total_cost || 0)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Preço médio ponderado</p>
        </div>

        <div className="glass-card p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Rentabilidade Total</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              (s?.total_gain || 0) >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {brl(s?.total_gain || 0)}
          </p>
          <p
            className={`text-xs font-semibold mt-0.5 ${
              (s?.total_gain_pct || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {pct(s?.total_gain_pct || 0)}
          </p>
        </div>

        <div className="glass-card p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Proventos (12m)</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {brl(s?.dividends_12m || 0)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Média {brl(s?.monthly_avg_dividends || 0)}/mês · YoC <strong>{(s?.yield_on_cost_pct || 0).toFixed(2)}%</strong>
          </p>
        </div>

        <div className="glass-card p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Variação do Dia · CDI</p>
          <p
            className={`text-2xl font-bold mt-1 flex items-center gap-1 ${
              (s?.day_change_value || 0) >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {(s?.day_change_value || 0) >= 0 ? (
              <TrendingUp className="w-5 h-5" />
            ) : (
              <TrendingDown className="w-5 h-5" />
            )}
            {pct(s?.day_change_pct || 0)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {brl(s?.day_change_value || 0)} · CDI {s?.cdi_annual_pct || 14.15}% a.a.
          </p>
        </div>
      </section>

      {/* Charts Row: Allocation Donut + Monthly Dividends Bar */}
      {portfolio && portfolio.assets.length > 0 && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="glass-card p-5 lg:col-span-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Alocação por Classe de Ativo</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-3">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={portfolio.allocation_by_class}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={3}
                    >
                      {portfolio.allocation_by_class.map((entry, idx) => (
                        <Cell key={entry.asset_class} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => brl(Number(v ?? 0))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 text-xs">
                {portfolio.allocation_by_class.map((entry, idx) => (
                  <div key={entry.asset_class} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                        {entry.label}
                      </span>
                    </span>
                    <span className="font-bold tabular-nums shrink-0">{entry.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card p-5 lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Proventos Mês a Mês (12 meses)</h2>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                Total: {brl(s?.dividends_12m || 0)}
              </span>
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={portfolio.monthly_dividends_12m}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip
                    formatter={(v) => brl(Number(v ?? 0))}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.4)',
                      background: 'rgba(15, 23, 42, 0.88)',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="total" name="Proventos" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Main Content Tabs: Ativos | Proventos | Operações */}
      <section className="glass-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/40 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex flex-wrap p-1 rounded-xl bg-white/50 dark:bg-white/10 border border-white/60 dark:border-white/15 self-start gap-0.5">
            {(
              [
                ['assets', `Ativos (${portfolio?.assets.length || 0})`],
                ['performance', 'vs CDI / IBOV'],
                ['rebalance', 'Onde Aportar'],
                ['calendar', 'Agenda 12m'],
                ['tax', 'IRPF B3'],
                ['dividends', `Proventos (${dividends.length})`],
                ['trades', `Operações (${trades.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setViewTab(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  viewTab === id ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {viewTab === 'assets' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {CLASS_FILTERS.map((cf) => (
                <button
                  key={cf.id}
                  type="button"
                  onClick={() => setClassFilter(cf.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition border ${
                    classFilter === cf.id
                      ? 'liquid-btn-primary border-transparent'
                      : 'bg-white/45 dark:bg-white/5 border-white/60 dark:border-white/10 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {cf.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-white/40 dark:bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : viewTab === 'performance' ? (
          <PerformancePanel token={token || ''} />
        ) : viewTab === 'rebalance' ? (
          <RebalancePanel token={token || ''} />
        ) : viewTab === 'calendar' ? (
          <DividendCalendarPanel token={token || ''} />
        ) : viewTab === 'tax' ? (
          <TaxReportPanel token={token || ''} />
        ) : viewTab === 'assets' ? (
          filteredAssets.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <TrendingUp className="w-10 h-10 mx-auto text-slate-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Sua carteira de investimentos está vazia
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                Lance suas compras de Ações/FIIs (com cotação automática da B3), importe a planilha da Área do Investidor B3 ou sincronize via Pluggy!
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/45 dark:bg-white/5 border-b border-white/40 dark:border-white/10 text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Ativo</th>
                    <th className="px-3 py-3 text-right">Qtd</th>
                    <th className="px-3 py-3 text-right">Preço Médio</th>
                    <th className="px-3 py-3 text-right">Cotação B3</th>
                    <th className="px-3 py-3 text-right">Saldo Atual</th>
                    <th className="px-3 py-3 text-right">Lucro / Prej.</th>
                    <th className="px-3 py-3 text-right">DY 12m</th>
                    <th className="px-3 py-3 text-right">P/L · P/VP</th>
                    <th className="px-3 py-3 text-right">% Cart.</th>
                    <th className="px-3 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/30 dark:divide-white/5">
                  {filteredAssets.map((a) => (
                    <tr key={a.id} className="hover:bg-white/40 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ background: 'var(--accent)' }}
                          >
                            {a.ticker.slice(0, 4)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 dark:text-white">{a.ticker}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                                {a.asset_class_label}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate max-w-[180px]">
                              {a.name}
                              {a.indexer ? ` · ${a.indexer_rate || ''}% ${a.indexer}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium">{a.quantity}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{brl(a.average_price)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <p className="font-semibold text-slate-900 dark:text-white">{brl(a.current_price)}</p>
                        {a.asset_class !== 'fixed_income' && (
                          <p
                            className={`text-[10px] font-semibold ${
                              a.day_change_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {pct(a.day_change_pct)} hoje
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-slate-900 dark:text-white">
                        {brl(a.current_value)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <p
                          className={`font-bold ${
                            a.gain_value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {brl(a.gain_value)}
                        </p>
                        <p
                          className={`text-[10px] font-semibold ${
                            a.gain_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {pct(a.gain_pct)}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                        {a.dy_12m != null ? `${a.dy_12m.toFixed(2)}%` : '—'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {a.pe_ratio != null || a.pvp_ratio != null
                          ? `${a.pe_ratio != null ? a.pe_ratio.toFixed(1) : '—'} · ${a.pvp_ratio != null ? a.pvp_ratio.toFixed(2) : '—'}`
                          : '—'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold">{a.portfolio_pct.toFixed(1)}%</td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setTradeForm({
                                ticker: a.ticker,
                                name: a.name,
                                asset_class: a.asset_class,
                                operation: 'buy',
                                trade_date: new Date().toISOString().slice(0, 10),
                                quantity: '',
                                unit_price: String(a.current_price.toFixed(2)),
                                fees: '0',
                                broker: a.broker || '',
                              })
                              setTradeModalOpen(true)
                            }}
                            title="Nova compra/venda"
                            className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-white/10 text-blue-600"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAsset(a)}
                            title="Remover ativo"
                            className="p-1.5 rounded-lg hover:bg-rose-50/70 dark:hover:bg-rose-950/30 text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : viewTab === 'dividends' ? (
          dividends.length === 0 ? (
            <p className="p-10 text-center text-xs text-slate-500">Nenhum provento registrado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/45 dark:bg-white/5 border-b border-white/40 dark:border-white/10 text-slate-500 uppercase">
                    <th className="px-4 py-3 text-left">Data Pagto</th>
                    <th className="px-4 py-3 text-left">Ativo</th>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-right">Valor Recebido</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/25 dark:divide-white/5">
                  {dividends.map((d) => (
                    <tr key={d.id}>
                      <td className="px-4 py-2.5">{d.payment_date}</td>
                      <td className="px-4 py-2.5 font-bold">{d.ticker}</td>
                      <td className="px-4 py-2.5 uppercase text-[11px]">{d.dividend_type}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        + {brl(d.total_amount)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => deleteDividend(d.id)}
                          aria-label="Excluir provento"
                          className="p-1 text-rose-500 hover:opacity-75"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : trades.length === 0 ? (
          <p className="p-10 text-center text-xs text-slate-500">Nenhuma operação registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/45 dark:bg-white/5 border-b border-white/40 dark:border-white/10 text-slate-500 uppercase">
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Ativo</th>
                  <th className="px-4 py-3 text-left">Operação</th>
                  <th className="px-4 py-3 text-right">Qtd</th>
                  <th className="px-4 py-3 text-right">Preço Unit.</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/25 dark:divide-white/5">
                {trades.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5">{t.trade_date}</td>
                    <td className="px-4 py-2.5 font-bold">{t.ticker}</td>
                    <td className="px-4 py-2.5 uppercase text-[11px] font-semibold">
                      {t.operation === 'buy' ? 'Compra' : t.operation === 'sell' ? 'Venda' : t.operation}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{t.quantity}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{brl(t.unit_price)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold">{brl(t.total)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => deleteTrade(t.id)}
                        aria-label="Excluir operação"
                        className="p-1 text-rose-500 hover:opacity-75"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal 1: Lançar Operação (Compra / Venda / Split / Bonificação) */}
      {tradeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <form onSubmit={submitTrade} className="glass-modal max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Lançar Operação B3</h2>
              <button type="button" onClick={() => setTradeModalOpen(false)} aria-label="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Ticker (ex.: PETR4, MXRF11)</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    required
                    placeholder="PETR4"
                    value={tradeForm.ticker}
                    onChange={(e) => setTradeForm({ ...tradeForm, ticker: e.target.value.toUpperCase() })}
                    onBlur={lookupTicker}
                    className="input-base uppercase font-bold"
                  />
                  <button
                    type="button"
                    onClick={lookupTicker}
                    title="Buscar cotação B3"
                    className="liquid-btn liquid-btn-glass px-2.5 rounded-xl"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Operação</label>
                <select
                  value={tradeForm.operation}
                  onChange={(e) => setTradeForm({ ...tradeForm, operation: e.target.value as 'buy' | 'sell' | 'bonus' | 'split' })}
                  className="input-base"
                >
                  <option value="buy">Compra</option>
                  <option value="sell">Venda</option>
                  <option value="bonus">Bonificação</option>
                  <option value="split">Desdobramento (Split)</option>
                </select>
              </div>
            </div>

            {quotePreview?.found && (
              <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">
                B3 ao vivo: <strong>{quotePreview.name}</strong> · Cotação atual{' '}
                <strong>{brl(quotePreview.price || 0)}</strong>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-medium mb-1">Quantidade</label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  required
                  value={tradeForm.quantity}
                  onChange={(e) => setTradeForm({ ...tradeForm, quantity: e.target.value })}
                  className="input-base"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Preço Unit. (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={tradeForm.unit_price}
                  onChange={(e) => setTradeForm({ ...tradeForm, unit_price: e.target.value })}
                  className="input-base"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Taxas (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tradeForm.fees}
                  onChange={(e) => setTradeForm({ ...tradeForm, fees: e.target.value })}
                  className="input-base"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Data</label>
                <input
                  type="date"
                  required
                  value={tradeForm.trade_date}
                  onChange={(e) => setTradeForm({ ...tradeForm, trade_date: e.target.value })}
                  className="input-base"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Corretora (opcional)</label>
                <input
                  type="text"
                  placeholder="XP, Inter, NuInvest..."
                  value={tradeForm.broker}
                  onChange={(e) => setTradeForm({ ...tradeForm, broker: e.target.value })}
                  className="input-base"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setTradeModalOpen(false)} className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
                {submitting ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 2: Renda Fixa */}
      {fixedModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <form onSubmit={submitFixedIncome} className="glass-modal max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Cadastrar Renda Fixa / Tesouro</h2>
              <button type="button" onClick={() => setFixedModalOpen(false)} aria-label="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Código</label>
                <input
                  type="text"
                  required
                  value={fixedForm.ticker}
                  onChange={(e) => setFixedForm({ ...fixedForm, ticker: e.target.value.toUpperCase() })}
                  className="input-base"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Valor Aplicado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={fixedForm.average_price}
                  onChange={(e) => setFixedForm({ ...fixedForm, average_price: e.target.value })}
                  className="input-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Descrição</label>
              <input
                type="text"
                required
                value={fixedForm.name}
                onChange={(e) => setFixedForm({ ...fixedForm, name: e.target.value })}
                className="input-base"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-medium mb-1">Indexador</label>
                <select
                  value={fixedForm.indexer}
                  onChange={(e) => setFixedForm({ ...fixedForm, indexer: e.target.value })}
                  className="input-base"
                >
                  <option value="CDI">CDI</option>
                  <option value="IPCA">IPCA+</option>
                  <option value="SELIC">SELIC</option>
                  <option value="PRE">Prefixado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Taxa (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={fixedForm.indexer_rate}
                  onChange={(e) => setFixedForm({ ...fixedForm, indexer_rate: e.target.value })}
                  className="input-base"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Vencimento</label>
                <input
                  type="date"
                  value={fixedForm.maturity_date}
                  onChange={(e) => setFixedForm({ ...fixedForm, maturity_date: e.target.value })}
                  className="input-base"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setFixedModalOpen(false)} className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
                {submitting ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 3: Registrar Provento */}
      {divModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <form onSubmit={submitDividend} className="glass-modal max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Lançar Provento / Dividendo</h2>
              <button type="button" onClick={() => setDivModalOpen(false)} aria-label="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Ticker</label>
                <input
                  type="text"
                  required
                  placeholder="MXRF11"
                  value={divForm.ticker}
                  onChange={(e) => setDivForm({ ...divForm, ticker: e.target.value.toUpperCase() })}
                  className="input-base uppercase font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Tipo</label>
                <select
                  value={divForm.dividend_type}
                  onChange={(e) => setDivForm({ ...divForm, dividend_type: e.target.value as 'dividend' | 'jcp' | 'fii_yield' | 'amortization' })}
                  className="input-base"
                >
                  <option value="dividend">Dividendo</option>
                  <option value="fii_yield">Rendimento FII</option>
                  <option value="jcp">JCP</option>
                  <option value="amortization">Amortização</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Valor Líquido (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={divForm.total_amount}
                  onChange={(e) => setDivForm({ ...divForm, total_amount: e.target.value })}
                  className="input-base"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Data de Pagamento</label>
                <input
                  type="date"
                  required
                  value={divForm.payment_date}
                  onChange={(e) => setDivForm({ ...divForm, payment_date: e.target.value })}
                  className="input-base"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDivModalOpen(false)} className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={submitting} className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
                {submitting ? 'Salvando...' : 'Salvar Provento'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

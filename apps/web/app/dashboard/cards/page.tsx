'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import {
  CreditCard as CreditCardIcon,
  Plus,
  Trash2,
  Edit3,
  Sparkles,
  Copy,
  AlertCircle,
  Calendar,
  DollarSign,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { useAuth } from '@/stores/auth/useAuth'
import { AISuggestionsBanner } from '@/components/ai/AISuggestionsBanner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface InvoicePoint {
  ym: string
  label: string
  total: number
}

interface InvoiceItem {
  id: string
  description: string
  merchant_name?: string | null
  amount: number
  transaction_date: string
  installment?: string | null
}

interface CardItem {
  id: string
  account_id?: string | null
  name: string
  brand: string
  last4?: string | null
  credit_limit: number
  closing_day: number
  due_day: number
  color: string
  open_invoice_month: string
  open_invoice_total: number
  future_installments_total: number
  total_committed: number
  available_limit: number
  usage_pct: number
  best_buy_day: number
  is_best_buy_window: boolean
  next_closing_date: string
  next_due_date: string
  upcoming_invoices: InvoicePoint[]
  open_invoice_items: InvoiceItem[]
  external_account_id?: string | null
  pluggy_balance?: number | null
  balance_divergence?: number | null
}

interface CardsPayload {
  cards: CardItem[]
  unlinked_credit_accounts: Array<{ account_id: string; name: string; balance: number }>
  summary: {
    cards_count: number
    total_limit: number
    total_open_invoices: number
    total_committed: number
    total_available: number
    overall_usage_pct: number
  }
}

interface CheckingAccount {
  id: string
  name: string
  type: string
  balance: number
}

const CARD_COLORS = [
  { id: '#7c3aed', label: 'Nubank Roxo' },
  { id: '#ea580c', label: 'Inter Laranja' },
  { id: '#0f172a', label: 'Black Carbon' },
  { id: '#0071E3', label: 'Azul Safira' },
  { id: '#059669', label: 'Esmeralda' },
  { id: '#be123c', label: 'Rubi' },
]

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

function fmtDate(iso: string): string {
  if (!iso || iso.length < 10) return iso
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

function daysUntilLabel(iso: string, verb: 'Fecha' | 'Vence'): string {
  if (!iso || iso.length < 10) return ''
  const target = new Date(`${iso.slice(0, 10)}T12:00:00`)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return `${verb} hoje`
  if (diff === 1) return `${verb} amanhã`
  if (diff > 1) return `${verb} em ${diff}d`
  return ''
}

export default function CardsPage() {
  return (
    <PrivateRoute>
      <CardsContent />
    </PrivateRoute>
  )
}

function CardsContent() {
  const { tokens } = useAuth()
  const token = tokens?.access_token || ''

  const [data, setData] = useState<CardsPayload | null>(null)
  const [checkingAccounts, setCheckingAccounts] = useState<CheckingAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CardItem | null>(null)
  const [deletingCard, setDeletingCard] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal Create/Edit Card
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    brand: 'mastercard',
    last4: '',
    credit_limit: '',
    closing_day: '10',
    due_day: '17',
    color: '#7c3aed',
    account_id: '',
  })

  // Modal Pay Invoice
  const [payCard, setPayCard] = useState<CardItem | null>(null)
  const [payForm, setPayForm] = useState({ source_account_id: '', amount: '' })
  const [paying, setPaying] = useState(false)

  const loadAll = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [cRes, aRes] = await Promise.all([
        fetch(`${API_URL}/credit-cards`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/accounts`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (cRes.ok) {
        const cData: CardsPayload = await cRes.json()
        setData(cData)
        if (cData.cards.length > 0 && !expandedId) {
          setExpandedId(cData.cards[0].id)
        }
      }
      if (aRes.ok) {
        const aList: CheckingAccount[] = await aRes.json()
        setCheckingAccounts(aList.filter((a) => a.type !== 'credit_card'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar cartões')
    } finally {
      setLoading(false)
    }
  }, [token, expandedId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const openNewModal = (presetAccount?: { account_id: string; name: string }) => {
    setEditingId(null)
    setForm({
      name: presetAccount?.name || '',
      brand: 'mastercard',
      last4: '',
      credit_limit: '5000',
      closing_day: '10',
      due_day: '17',
      color: '#7c3aed',
      account_id: presetAccount?.account_id || '',
    })
    setModalOpen(true)
  }

  const openEditModal = (card: CardItem) => {
    setEditingId(card.id)
    setForm({
      name: card.name,
      brand: card.brand,
      last4: card.last4 || '',
      credit_limit: String(card.credit_limit),
      closing_day: String(card.closing_day),
      due_day: String(card.due_day),
      color: card.color,
      account_id: card.account_id || '',
    })
    setModalOpen(true)
  }

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const url = editingId ? `${API_URL}/credit-cards/${editingId}` : `${API_URL}/credit-cards`
      const method = editingId ? 'PUT' : 'POST'
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        brand: form.brand,
        last4: form.last4.trim() || null,
        credit_limit: Number(form.credit_limit),
        closing_day: Number(form.closing_day),
        due_day: Number(form.due_day),
        color: form.color,
      }
      if (!editingId && form.account_id) {
        body.account_id = form.account_id
      }
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.detail || 'Erro ao salvar cartão')
      }
      setModalOpen(false)
      dispatchToast(
        editingId ? 'Cartão atualizado com sucesso!' : 'Cartão cadastrado e pronto para controlar faturas!',
        'success'
      )
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cartão')
    } finally {
      setSaving(false)
    }
  }

  const executeDeleteCard = async () => {
    if (!token || !deleteTarget) return
    setDeletingCard(true)
    try {
      await fetch(`${API_URL}/credit-cards/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      dispatchToast(`Cartão "${deleteTarget.name}" removido.`, 'info')
      setDeleteTarget(null)
      await loadAll()
    } finally {
      setDeletingCard(false)
    }
  }

  const handlePayInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !payCard || !payForm.source_account_id) return
    setPaying(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/credit-cards/${payCard.id}/pay`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_account_id: payForm.source_account_id,
          amount: Number(payForm.amount),
          statement_month: payCard.open_invoice_month,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Erro ao registrar pagamento')
      }
      setPayCard(null)
      dispatchToast('Pagamento de fatura registrado como Transferência Interna!', 'success')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mony:transactions-updated'))
      }
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao pagar fatura')
    } finally {
      setPaying(false)
    }
  }

  const s = data?.summary

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <header className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <CreditCardIcon className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Cartões de Crédito &amp; Faturas
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Limite utilizado vs disponível, melhor dia de compra, fatura aberta e projeção de parcelas dos próximos 6 meses.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => openNewModal()}
          className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo Cartão
        </button>
      </header>

      {error && (
        <div className="glass-card p-3.5 border-rose-400/50 flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Story 5.6: Proactive AI Audit Banner for Credit Cards */}
      <AISuggestionsBanner
        module="cards"
        title="Auditoria Proativa IA · Cartões & Faturas"
        onApplied={loadAll}
      />

      {/* Unlinked Pluggy / Account Credit Cards suggestion banner */}
      {data && data.unlinked_credit_accounts.length > 0 && (
        <section className="glass-card p-4 border-[var(--accent)]/40 bg-[var(--accent-soft)]/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <p className="text-xs text-slate-800 dark:text-slate-100">
              Encontramos <strong>{data.unlinked_credit_accounts.length}</strong> conta(s) de cartão de crédito (ex.: Pluggy Open Finance) sem limite/fechamento configurado:
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.unlinked_credit_accounts.map((ua) => (
              <button
                key={ua.account_id}
                type="button"
                onClick={() => openNewModal(ua)}
                className="liquid-btn liquid-btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold"
              >
                + Configurar {ua.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 4 Consolidated KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">Limite Total</p>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
            {brl(s?.total_limit || 0)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">{s?.cards_count || 0} cartão(ões) ativo(s)</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">Faturas Abertas (Mês Atual)</p>
          <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
            {brl(s?.total_open_invoices || 0)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Soma dos ciclos abertos</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">Total Comprometido (c/ Parcelas)</p>
          <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
            {brl(s?.total_committed || 0)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">{(s?.overall_usage_pct || 0).toFixed(1)}% do limite total</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">Limite Disponível</p>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
            {brl(s?.total_available || 0)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Livre para novas compras</p>
        </div>
      </section>

      {/* Cards Grid */}
      {loading ? (
        <div className="glass-card p-8 text-sm text-slate-500">Carregando cartões...</div>
      ) : !data || data.cards.length === 0 ? (
        <section className="glass-panel p-10 text-center space-y-3">
          <CreditCardIcon className="w-10 h-10 mx-auto text-slate-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Nenhum cartão cadastrado ainda
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Cadastre seus cartões (Nubank, Inter, Itaú, XP, C6) informando limite, dia de fechamento e vencimento para acompanhar o melhor dia de compra e todas as faturas futuras.
          </p>
          <button
            type="button"
            onClick={() => openNewModal()}
            className="liquid-btn liquid-btn-primary px-5 py-2.5 rounded-2xl text-xs font-semibold inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Adicionar Primeiro Cartão
          </button>
        </section>
      ) : (
        <div className="space-y-5">
          {data.cards.map((card) => {
            const expanded = expandedId === card.id
            const barColor =
              card.usage_pct >= 85
                ? 'bg-rose-500'
                : card.usage_pct >= 60
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'

            return (
              <section key={card.id} className="glass-panel p-5 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                  {/* Visual Liquid Glass Physical Card with specular sheen */}
                  <div
                    className="lg:col-span-4 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden border border-white/25 transition-transform duration-300 hover:-translate-y-0.5"
                    style={{
                      background: `radial-gradient(circle at 18% 12%, rgba(255,255,255,0.28) 0%, transparent 48%), linear-gradient(135deg, ${card.color} 0%, #0f172a 100%)`,
                    }}
                  >
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -top-12 -right-12 w-36 h-36 rounded-full bg-white/15 blur-2xl"
                    />
                    <div className="relative flex items-center justify-between gap-1">
                      <span className="text-xs uppercase tracking-widest opacity-85 font-semibold">
                        {card.brand}
                      </span>
                      <div className="flex items-center gap-1">
                        {card.external_account_id && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white backdrop-blur-sm">
                            Open Finance
                          </span>
                        )}
                        {card.is_best_buy_window && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400/30 text-emerald-100 border border-emerald-300/40 shadow-sm">
                            ✨ Melhor dia!
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="relative text-lg font-extrabold mt-4 tracking-tight">{card.name}</p>
                    <p className="relative font-mono text-xs opacity-80 mt-1 tracking-wider">
                      •••• •••• •••• {card.last4 || '0000'}
                    </p>
                    <div className="relative mt-5 flex items-end justify-between text-xs gap-2">
                      <div>
                        <span className="opacity-75 block text-[10px]">Fatura Aberta ({card.open_invoice_month})</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg font-extrabold tabular-nums money-value">{brl(card.open_invoice_total)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const formatted = brl(card.open_invoice_total)
                              navigator.clipboard?.writeText(formatted).then(() => {
                                dispatchToast(`Fatura ${card.name} copiada: ${formatted}`, 'info', { durationMs: 2500 })
                              }).catch(() => undefined)
                            }}
                            title="Copiar total da fatura"
                            aria-label={`Copiar valor da fatura de ${card.name}`}
                            className="p-1 rounded-lg bg-white/15 hover:bg-white/25 text-white/90 transition"
                          >
                            <Copy className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="opacity-75 block text-[10px]">Melhor dia</span>
                        <span className="font-bold">Dia {card.best_buy_day}</span>
                      </div>
                    </div>
                  </div>

                  {/* Limit & Cycle Metrics */}
                  <div className="lg:col-span-8 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" />
                          Fecha dia <strong>{card.closing_day}</strong> ({fmtDate(card.next_closing_date)})
                        </span>
                        {daysUntilLabel(card.next_closing_date, 'Fecha') && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300">
                            {daysUntilLabel(card.next_closing_date, 'Fecha')}
                          </span>
                        )}
                        <span>·</span>
                        <span>
                          Vence dia <strong>{card.due_day}</strong> ({fmtDate(card.next_due_date)})
                        </span>
                        {daysUntilLabel(card.next_due_date, 'Vence') && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300">
                            {daysUntilLabel(card.next_due_date, 'Vence')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPayCard(card)
                            setPayForm({
                              source_account_id: checkingAccounts[0]?.id || '',
                              amount: String(card.open_invoice_total || ''),
                            })
                          }}
                          className="liquid-btn liquid-btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          Pagar Fatura
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(card)}
                          className="liquid-btn liquid-btn-glass p-2 rounded-xl"
                          aria-label="Editar cartão"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(card)}
                          className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10"
                          aria-label="Excluir cartão"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Limit bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-300">
                          Comprometido: <strong>{brl(card.total_committed)}</strong> ({card.usage_pct}%)
                          {card.future_installments_total > 0 && (
                            <span className="text-slate-500"> · inclui {brl(card.future_installments_total)} em parcelas futuras</span>
                          )}
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          Disponível: {brl(card.available_limit)}
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.min(100, card.usage_pct)}%` }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : card.id)}
                      className="text-xs font-semibold text-[var(--accent)] inline-flex items-center gap-1 hover:underline"
                    >
                      {expanded ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" /> Ocultar fatura aberta e projeção 6 meses
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" /> Ver fatura aberta ({card.open_invoice_items.length} itens) e projeção 6 meses
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded: 6-Month Forecast + Open Invoice Items */}
                {expanded && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-4 border-t border-white/30 dark:border-white/10">
                    <div className="lg:col-span-6 glass-card p-4">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-3">
                        Projeção das Próximas 6 Faturas
                      </h3>
                      <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={card.upcoming_invoices}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                            <Tooltip
                              formatter={(v) => brl(Number(v ?? 0))}
                              contentStyle={{
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.4)',
                                background: 'rgba(15, 23, 42, 0.9)',
                                color: '#f8fafc',
                                fontSize: '12px',
                              }}
                            />
                            <Bar dataKey="total" name="Fatura" fill={card.color} radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="lg:col-span-6 glass-card p-4">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-3">
                        Lançamentos da Fatura Aberta ({card.open_invoice_month})
                      </h3>
                      {card.open_invoice_items.length === 0 ? (
                        <p className="text-xs text-slate-500 py-6 text-center">
                          Nenhum lançamento nesta fatura ainda. Use a Mony IA (voz ou PDF/foto) ou o Open Finance Pluggy para importar!
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {card.open_invoice_items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between text-xs py-1.5 border-b border-white/20 dark:border-white/5 last:border-0"
                            >
                              <div className="min-w-0 pr-2">
                                <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                  {item.description}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  {fmtDate(item.transaction_date)}
                                  {item.installment ? ` · Parcela ${item.installment}` : ''}
                                </p>
                              </div>
                              <span
                                className={`font-bold tabular-nums shrink-0 ${
                                  item.amount < 0 ? 'text-emerald-600' : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {brl(item.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* Modal: Create/Edit Card */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveCard} className="glass-modal max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {editingId ? 'Editar Cartão' : 'Novo Cartão de Crédito'}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Nome do Cartão</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Nubank Ultravioleta, Inter Black"
                  className="w-full px-3 py-2 glass-input rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Bandeira</label>
                  <select
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    className="w-full px-3 py-2 glass-input rounded-xl text-sm"
                  >
                    <option value="mastercard">Mastercard</option>
                    <option value="visa">Visa</option>
                    <option value="elo">Elo</option>
                    <option value="amex">American Express</option>
                    <option value="other">Outra</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Últimos 4 dígitos</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={form.last4}
                    onChange={(e) => setForm({ ...form, last4: e.target.value.replace(/\D/g, '') })}
                    placeholder="4829"
                    className="w-full px-3 py-2 glass-input rounded-xl text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Limite Total (R$)</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={form.credit_limit}
                  onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-xl text-sm font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Dia de Fechamento</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="31"
                    value={form.closing_day}
                    onChange={(e) => setForm({ ...form, closing_day: e.target.value })}
                    className="w-full px-3 py-2 glass-input rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Dia de Vencimento</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="31"
                    value={form.due_day}
                    onChange={(e) => setForm({ ...form, due_day: e.target.value })}
                    className="w-full px-3 py-2 glass-input rounded-xl text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">Cor do Cartão</label>
                <div className="flex items-center gap-2">
                  {CARD_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForm({ ...form, color: c.id })}
                      title={c.label}
                      className={`w-7 h-7 rounded-full border-2 transition ${
                        form.color === c.id ? 'border-white scale-110 shadow-md' : 'border-transparent opacity-75'
                      }`}
                      style={{ background: c.id }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Cartão'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Pay Invoice */}
      {payCard && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handlePayInvoice} className="glass-modal max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Pagar Fatura · {payCard.name}
              </h2>
              <button type="button" onClick={() => setPayCard(null)} aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              O pagamento será registrado como <strong>Transferência Interna</strong> (desconta da conta corrente sem duplicar despesas no Dashboard).
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Pagar com a conta</label>
                <select
                  required
                  value={payForm.source_account_id}
                  onChange={(e) => setPayForm({ ...payForm, source_account_id: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-xl text-sm"
                >
                  {checkingAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({brl(a.balance)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Valor pago (R$)</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-xl text-sm font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayCard(null)}
                className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={paying || !payForm.source_account_id}
                className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
              >
                {paying ? 'Registrando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Remover o cartão "${deleteTarget?.name || ''}"?`}
        description="Os lançamentos históricos permanecerão salvos nas suas transações."
        confirmLabel="Remover"
        variant="danger"
        loading={deletingCard}
        onConfirm={executeDeleteCard}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

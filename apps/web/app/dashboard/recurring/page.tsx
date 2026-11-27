'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  Repeat,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit2,
  CheckCircle2,
  Clock,
  Sparkles,
  X,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { dispatchToast } from '@/components/ui/ToastProvider'
import { useAuth } from '@/stores/auth/useAuth'
import { useCategories } from '@/hooks/useCategories'
import { PAYMENT_METHOD_LABELS } from '@/components/dashboard/FilterBar'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface RecurringRule {
  id: string
  account_id: string
  account_name?: string | null
  type: 'expense' | 'income' | 'investment' | 'transfer'
  amount: number
  currency: string
  description: string
  merchant_name?: string | null
  category_name: string
  payment_method: string
  frequency: 'monthly' | 'weekly' | 'yearly'
  day_of_month: number
  is_active: boolean
  auto_create: boolean
  source?: string
  last_generated_month?: string | null
  generated_this_month: boolean
  next_due_date: string
}

interface RecurringSummary {
  monthly_fixed_income: number
  monthly_fixed_expenses: number
  monthly_fixed_net: number
  active_count: number
  pending_this_month_count: number
}

interface AccountOption {
  id: string
  name: string
  is_default?: boolean
}

function formatBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function RecurringPage() {
  return (
    <PrivateRoute>
      <RecurringContent />
    </PrivateRoute>
  )
}

function RecurringContent() {
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const { categories } = useCategories(token)

  const [rules, setRules] = useState<RecurringRule[]>([])
  const [summary, setSummary] = useState<RecurringSummary>({
    monthly_fixed_income: 0,
    monthly_fixed_expenses: 0,
    monthly_fixed_net: 0,
    active_count: 0,
    pending_this_month_count: 0,
  })
  const [currentMonth, setCurrentMonth] = useState('')
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RecurringRule | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [filterTab, setFilterTab] = useState<'all' | 'income' | 'expense' | 'pending'>('all')
  const [banner, setBanner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const catMetaByName = React.useMemo(() => {
    const map: Record<string, { color: string; icon?: string }> = {}
    for (const c of categories) {
      map[c.name.toLowerCase()] = { color: c.color, icon: c.icon }
    }
    return map
  }, [categories])

  const filteredRules = React.useMemo(() => {
    return rules.filter((r) => {
      if (filterTab === 'income') return r.type === 'income'
      if (filterTab === 'expense') return r.type === 'expense'
      if (filterTab === 'pending') return r.is_active && !r.generated_this_month
      return true
    })
  }, [rules, filterTab])

  const annualizedCost = (r: RecurringRule): number => {
    const amt = Number(r.amount) || 0
    if (r.frequency === 'weekly') return amt * 52
    if (r.frequency === 'yearly') return amt
    return amt * 12
  }

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringRule | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    account_id: '',
    type: 'expense' as 'expense' | 'income',
    description: '',
    amount: '',
    category_name: 'Moradia',
    payment_method: 'boleto',
    frequency: 'monthly' as 'monthly' | 'weekly' | 'yearly',
    day_of_month: 5,
  })

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [recRes, acctRes] = await Promise.all([
        fetch(`${API_URL}/recurring`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/accounts`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (recRes.ok) {
        const d = await recRes.json()
        setRules(d.items || [])
        setSummary(d.summary)
        setCurrentMonth(d.month || '')
      }
      if (acctRes.ok) {
        const aData = await acctRes.json()
        const list: AccountOption[] = Array.isArray(aData) ? aData : aData.items || []
        setAccounts(list)
        if (list.length > 0 && !form.account_id) {
          const def = list.find((a) => a.is_default) || list[0]
          setForm((prev) => ({ ...prev, account_id: prev.account_id || def.id }))
        }
      }
    } catch {
      setError('Erro ao carregar recorrências.')
    } finally {
      setLoading(false)
    }
  }, [token, form.account_id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openNewModal = () => {
    setEditing(null)
    const defAcct = accounts.find((a) => a.is_default) || accounts[0]
    setForm({
      account_id: defAcct?.id || '',
      type: 'expense',
      description: '',
      amount: '',
      category_name: 'Moradia',
      payment_method: 'boleto',
      frequency: 'monthly',
      day_of_month: 10,
    })
    setModalOpen(true)
  }

  const openEditModal = (rule: RecurringRule) => {
    setEditing(rule)
    setForm({
      account_id: rule.account_id,
      type: rule.type === 'income' ? 'income' : 'expense',
      description: rule.description,
      amount: String(rule.amount),
      category_name: rule.category_name || 'Outros',
      payment_method: rule.payment_method || 'boleto',
      frequency: rule.frequency,
      day_of_month: rule.day_of_month,
    })
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        account_id: form.account_id,
        type: form.type,
        description: form.description.trim(),
        amount: parseFloat(form.amount.replace(',', '.')),
        category_name: form.category_name,
        payment_method: form.payment_method,
        frequency: form.frequency,
        day_of_month: Number(form.day_of_month),
      }
      const res = await fetch(
        editing ? `${API_URL}/recurring/${editing.id}` : `${API_URL}/recurring`,
        {
          method: editing ? 'PUT' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Não foi possível salvar recorrência')
      }
      setModalOpen(false)
      setBanner(editing ? 'Recorrência atualizada!' : 'Recorrência criada com sucesso!')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const handleDetectRecurrences = async () => {
    if (!token) return
    setDetecting(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/recurring/detect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Falha ao detectar recorrências automaticamente')
      const data = await res.json()
      const count = Number(data.detected_and_registered ?? data.detected_count ?? 0)
      setBanner(
        count > 0
          ? `${count} recorrência(s) detectada(s) e cadastrada(s) automaticamente pela IA!`
          : 'Nenhuma nova recorrência detectada no seu histórico recente (todas já estão cadastradas).'
      )
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao detectar recorrências')
    } finally {
      setDetecting(false)
    }
  }

  const handleGenerateAll = async () => {
    if (!token) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/recurring/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('Falha ao gerar recorrências')
      const data = await res.json()
      setBanner(
        data.generated > 0
          ? `${data.generated} lançamento(s) recorrente(s) gerado(s) para ${data.month}!`
          : `Todas as recorrências ativas já estavam lançadas em ${data.month}.`
      )
      window.dispatchEvent(new CustomEvent('mony:transactions-updated'))
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar lançamentos')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateOne = async (rule: RecurringRule) => {
    if (!token) return
    setError(null)
    try {
      const res = await fetch(`${API_URL}/recurring/${rule.id}/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('Erro ao lançar recorrência')
      const data = await res.json()
      setBanner(
        data.generated > 0
          ? `"${rule.description}" lançado em ${data.month}!`
          : `"${rule.description}" já foi lançado neste mês.`
      )
      window.dispatchEvent(new CustomEvent('mony:transactions-updated'))
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao lançar')
    }
  }

  const handleToggleActive = async (rule: RecurringRule) => {
    if (!token) return
    await fetch(`${API_URL}/recurring/${rule.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_active: !rule.is_active }),
    })
    await loadData()
  }

  const handleDelete = (rule: RecurringRule) => {
    setDeleteTarget(rule)
  }

  const confirmDelete = async () => {
    if (!token || !deleteTarget) return
    setDeleting(true)
    try {
      await fetch(`${API_URL}/recurring/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      dispatchToast(`Recorrência "${deleteTarget.description}" removida.`, 'info')
      setDeleteTarget(null)
      await loadData()
    } finally {
      setDeleting(false)
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
            <Repeat className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Contas Fixas & Recorrentes
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Automatize aluguel, internet, streaming e salário · alertas automáticos antes do vencimento
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleDetectRecurrences}
            disabled={detecting}
            className="liquid-btn liquid-btn-glass inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />
            {detecting ? 'Analisando histórico...' : 'Detectar Recorrências (IA)'}
          </button>
          {summary.pending_this_month_count > 0 && (
            <button
              type="button"
              onClick={handleGenerateAll}
              disabled={generating}
              className="liquid-btn liquid-btn-glass inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              {generating
                ? 'Gerando...'
                : `Lançar ${summary.pending_this_month_count} pendente(s) (${currentMonth})`}
            </button>
          )}
          <button
            type="button"
            onClick={openNewModal}
            className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Nova Recorrência
          </button>
        </div>
      </header>

      {banner && (
        <div
          role="status"
          className="glass-card p-4 border-emerald-400/50 flex items-center justify-between gap-3 text-sm text-emerald-800 dark:text-emerald-200"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            {banner}
          </span>
          <button type="button" onClick={() => setBanner(null)} aria-label="Fechar aviso">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="glass-card p-4 border-rose-400/50 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Receitas Fixas / mês</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {formatBRL(summary.monthly_fixed_income)}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Despesas Fixas / mês</p>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1 money-value">
            {formatBRL(summary.monthly_fixed_expenses)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 money-value">
            {formatBRL(summary.monthly_fixed_expenses * 12)} / ano
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Saldo Fixo Previsto</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {formatBRL(summary.monthly_fixed_net)}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Pendentes em {currentMonth || 'este mês'}</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {summary.pending_this_month_count}
          </p>
        </div>
      </div>

      {/* Quick Filter Pills */}
      {!loading && rules.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrar recorrências">
          {(
            [
              ['all', `Todas (${rules.length})`],
              ['expense', `Despesas Fixas (${rules.filter((r) => r.type === 'expense').length})`],
              ['income', `Receitas Fixas (${rules.filter((r) => r.type === 'income').length})`],
              ['pending', `Pendentes no mês (${rules.filter((r) => r.is_active && !r.generated_this_month).length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterTab(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                filterTab === key
                  ? 'liquid-btn-primary border-transparent shadow-sm'
                  : 'bg-white/50 dark:bg-white/5 border-white/60 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-white/75 dark:hover:bg-white/15'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Rules List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card h-20 animate-pulse" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="glass-panel text-center py-14 space-y-3">
          <Repeat className="w-10 h-10 mx-auto text-slate-400" aria-hidden="true" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Nenhuma conta fixa ou receita recorrente cadastrada
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
            Cadastre salário, aluguel, internet, academia ou assinaturas para lançar tudo com 1 clique todo mês e receber alertas antes do vencimento.
          </p>
          <button
            type="button"
            onClick={openNewModal}
            className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold mt-2"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Cadastrar primeira recorrência
          </button>
        </div>
      ) : filteredRules.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Nenhuma recorrência neste filtro.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRules.map((rule) => {
            const catMeta = catMetaByName[(rule.category_name || '').toLowerCase()]
            const catColor = catMeta?.color || '#64748b'
            const catIcon = catMeta?.icon || '🏷️'
            const annual = annualizedCost(rule)
            return (
            <div
              key={rule.id}
              className={`glass-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-opacity ${
                !rule.is_active ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <span
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                    rule.type === 'income'
                      ? 'bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-100/80 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {rule.type === 'income' ? (
                    <TrendingUp className="w-5 h-5" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="w-5 h-5" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {rule.description}
                    </h3>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{
                        backgroundColor: `${catColor}20`,
                        color: catColor,
                        border: `1px solid ${catColor}45`,
                      }}
                    >
                      <span aria-hidden="true">{catIcon}</span>
                      <span>{rule.category_name}</span>
                    </span>
                    {rule.source === 'ai_detected' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100/80 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                        <Sparkles className="w-3 h-3" aria-hidden="true" />
                        Auto-detectada (IA)
                      </span>
                    )}
                    {!rule.is_active ? (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                        Pausada
                      </span>
                    ) : rule.generated_this_month ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                        Lançado em {currentMonth}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100/80 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        Pendente · dia {rule.day_of_month}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    Todo dia <strong>{rule.day_of_month}</strong> ·{' '}
                    {PAYMENT_METHOD_LABELS[rule.payment_method] || rule.payment_method}
                    {rule.account_name ? ` · ${rule.account_name}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                <div className="text-right">
                  <span
                    className={`block text-base font-bold tabular-nums money-value ${
                      rule.type === 'income'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {rule.type === 'income' ? '+' : '-'} {formatBRL(rule.amount)}
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 tabular-nums money-value">
                    {formatBRL(annual)}/ano
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {rule.is_active && !rule.generated_this_month && (
                    <button
                      type="button"
                      onClick={() => handleGenerateOne(rule)}
                      className="liquid-btn liquid-btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold"
                    >
                      Lançar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleToggleActive(rule)}
                    title={rule.is_active ? 'Pausar recorrência' : 'Reativar recorrência'}
                    aria-label={rule.is_active ? 'Pausar recorrência' : 'Reativar recorrência'}
                    className="p-2 rounded-xl hover:bg-white/60 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300"
                  >
                    {rule.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(rule)}
                    aria-label="Editar recorrência"
                    className="p-2 rounded-xl hover:bg-white/60 dark:hover:bg-white/10 text-blue-600 dark:text-blue-400"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(rule)}
                    aria-label="Excluir recorrência"
                    className="p-2 rounded-xl hover:bg-rose-50/70 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recurring-modal-title"
        >
          <form onSubmit={handleSave} className="glass-modal max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="recurring-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
                {editing ? 'Editar Recorrência' : 'Nova Recorrência'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Fechar modal"
                className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tipo
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as 'expense' | 'income' })}
                  className="input-base"
                >
                  <option value="expense">Despesa Fixa</option>
                  <option value="income">Receita Fixa</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Conta
                </label>
                <select
                  required
                  value={form.account_id}
                  onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                  className="input-base"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Descrição
              </label>
              <input
                type="text"
                required
                placeholder="Ex.: Aluguel, Internet Fibra, Salário..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input-base"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Valor (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="input-base"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Dia do vencimento (1–31)
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  required
                  value={form.day_of_month}
                  onChange={(e) => setForm({ ...form, day_of_month: Number(e.target.value) })}
                  className="input-base"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Categoria
                </label>
                <select
                  value={form.category_name}
                  onChange={(e) => setForm({ ...form, category_name: e.target.value })}
                  className="input-base"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.icon ? `${c.icon} ` : ''}
                      {c.name}
                    </option>
                  ))}
                  {categories.length === 0 && (
                    <>
                      <option value="Moradia">Moradia</option>
                      <option value="Trabalho">Trabalho</option>
                      <option value="Alimentação">Alimentação</option>
                      <option value="Lazer">Lazer</option>
                      <option value="Outros">Outros</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Forma de pagamento
                </label>
                <select
                  value={form.payment_method}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                  className="input-base"
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar recorrência'}
              </button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remover recorrência?"
        description={`A regra "${deleteTarget?.description || ''}" deixará de gerar lembretes e lançamentos futuros. Transações já lançadas não serão apagadas.`}
        confirmLabel="Remover"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

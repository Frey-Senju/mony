'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Trash2,
  ShieldAlert,
  RefreshCw,
  Edit3,
  Check,
  X,
  Clock,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface PendingItem {
  id: string
  mony_account_id: string
  account_name: string
  type: string
  amount: number
  description: string
  transaction_date: string
  statement_month?: string | null
  payment_method?: string | null
  installment_number?: number | null
  installment_total?: number | null
  suggested_category_name: string
  status: string
}

interface ImportedSummary {
  transactions_open_finance: number
  pending_approval: number
  auto_credit_cards: number
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatBRDate(iso?: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

export function OpenFinanceApprovalAndClean({
  token,
  onChanged,
}: {
  token?: string
  onChanged?: () => void
}) {
  const [items, setItems] = useState<PendingItem[]>([])
  const [summary, setSummary] = useState<ImportedSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [editCat, setEditCat] = useState('')
  const [editMonth, setEditMonth] = useState('')

  // Clean dialog
  const [cleanDialogOpen, setCleanDialogOpen] = useState(false)
  const [clearAutoCards, setClearAutoCards] = useState(false)
  const [cleaning, setCleaning] = useState(false)

  const loadAll = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [pRes, sRes] = await Promise.all([
        fetch(`${API_URL}/open-finance/pluggy/pending?status_filter=pending`, { headers }),
        fetch(`${API_URL}/open-finance/pluggy/imported-summary`, { headers }),
      ])
      if (pRes.ok) {
        const d = await pRes.json()
        setItems(d.items || [])
        setSelected(new Set())
      }
      if (sRes.ok) {
        setSummary(await sRes.json())
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadAll()
    const onUpd = () => loadAll()
    window.addEventListener('mony:transactions-updated', onUpd)
    return () => window.removeEventListener('mony:transactions-updated', onUpd)
  }, [loadAll])

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map((i) => i.id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAction = async (mode: 'approve' | 'reject', ids?: string[], approveAll = false) => {
    if (!token) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/open-finance/pluggy/pending/${mode}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids || Array.from(selected), approve_all: approveAll }),
      })
      if (res.ok) {
        const d = await res.json()
        dispatchToast(
          mode === 'approve'
            ? `${d.approved} lançamento(s) aprovado(s) e adicionado(s) aos seus gastos!`
            : `${d.rejected} lançamento(s) rejeitado(s) — não voltarão em futuras sincronizações.`,
          mode === 'approve' ? 'success' : 'info'
        )
        window.dispatchEvent(new Event('mony:transactions-updated'))
        onChanged?.()
        await loadAll()
      }
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (item: PendingItem) => {
    setEditingId(item.id)
    setEditDesc(item.description)
    setEditCat(item.suggested_category_name)
    setEditMonth(item.statement_month || item.transaction_date.slice(0, 7))
  }

  const saveEdit = async (id: string) => {
    if (!token) return
    const res = await fetch(`${API_URL}/open-finance/pluggy/pending/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: editDesc.trim(),
        suggested_category_name: editCat.trim() || 'Outros',
        statement_month: editMonth || undefined,
      }),
    })
    if (res.ok) {
      setEditingId(null)
      dispatchToast('Item pendente atualizado!', 'success')
      await loadAll()
    }
  }

  const handleConfirmClean = async () => {
    if (!token) return
    setCleaning(true)
    try {
      const res = await fetch(
        `${API_URL}/open-finance/pluggy/imported-data?clear_pending=true&clear_auto_cards=${clearAutoCards ? 'true' : 'false'}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        const d = await res.json()
        dispatchToast(
          `Limpeza concluída: ${d.deleted_transactions} lançamento(s) Open Finance e ${d.deleted_pending} pendência(s) removidos. Seus dados manuais e da planilha foram mantidos intactos!`,
          'success'
        )
        setCleanDialogOpen(false)
        window.dispatchEvent(new Event('mony:transactions-updated'))
        onChanged?.()
        await loadAll()
      }
    } finally {
      setCleaning(false)
    }
  }

  if (!token) return null

  return (
    <div className="space-y-5">
      {/* Story 7.1: Approval Queue */}
      <section className="glass-panel space-y-4 border-amber-400/40" aria-label="Fila de aprovação de transações Open Finance">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" aria-hidden="true" />
              Fila de Aprovação Open Finance ({items.length})
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Nenhuma transação do banco entra nos seus gastos sem sua aprovação. Edite, aprove ou descarte abaixo.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={loadAll}
              disabled={loading}
              className="liquid-btn liquid-btn-glass px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            {items.length > 0 && (
              <>
                <button
                  type="button"
                  disabled={busy || selected.size === 0}
                  onClick={() => handleAction('approve')}
                  className="liquid-btn liquid-btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Aprovar ({selected.size})
                </button>
                <button
                  type="button"
                  disabled={busy || selected.size === 0}
                  onClick={() => handleAction('reject')}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 inline-flex items-center gap-1.5 disabled:opacity-40"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Rejeitar ({selected.size})
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleAction('approve', [], true)}
                  className="liquid-btn liquid-btn-glass px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                >
                  Aprovar Todas
                </button>
              </>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="glass-card p-5 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhuma transação pendente de aprovação no momento. Quando você sincronizar um banco pelo Open Finance, os novos lançamentos aparecerão aqui para revisão.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200/70 dark:border-white/10 text-xs text-slate-500">
                  <th className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={selected.size === items.length && items.length > 0}
                      onChange={toggleAll}
                      aria-label="Selecionar todas as pendências"
                    />
                  </th>
                  <th className="py-2 px-2">Data / Fatura</th>
                  <th className="py-2 px-2">Descrição &amp; Conta</th>
                  <th className="py-2 px-2">Categoria</th>
                  <th className="py-2 px-2 text-right">Valor</th>
                  <th className="py-2 pl-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                {items.map((item) => {
                  const isEditing = editingId === item.id
                  return (
                    <tr key={item.id} className="hover:bg-white/40 dark:hover:bg-white/5">
                      <td className="py-2.5 pr-2">
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleOne(item.id)}
                          aria-label={`Selecionar ${item.description}`}
                        />
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                        <div>{formatBRDate(item.transaction_date)}</div>
                        {isEditing ? (
                          <input
                            type="month"
                            value={editMonth}
                            onChange={(e) => setEditMonth(e.target.value)}
                            className="mt-1 px-1.5 py-0.5 text-[11px] rounded border border-slate-300 dark:border-white/20 bg-transparent"
                          />
                        ) : (
                          <div className="text-[10px] text-slate-400">Fatura {item.statement_month}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className="w-full px-2 py-1 text-xs rounded-lg border border-slate-300 dark:border-white/20 bg-transparent"
                          />
                        ) : (
                          <>
                            <p className="font-semibold text-slate-900 dark:text-white">{item.description}</p>
                            <p className="text-[11px] text-slate-500">
                              {item.account_name}
                              {item.installment_total ? ` · ${item.installment_number}/${item.installment_total}` : ''}
                            </p>
                          </>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editCat}
                            onChange={(e) => setEditCat(e.target.value)}
                            className="w-28 px-2 py-1 text-xs rounded-lg border border-slate-300 dark:border-white/20 bg-transparent"
                          />
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200">
                            {item.suggested_category_name}
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-bold whitespace-nowrap money-value ${
                          item.type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {item.type === 'income' ? '+' : '-'} {brl(item.amount)}
                      </td>
                      <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => saveEdit(item.id)}
                              aria-label="Salvar edição"
                              className="p-1.5 rounded-lg bg-emerald-600 text-white"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              aria-label="Cancelar edição"
                              className="p-1.5 rounded-lg bg-slate-200 dark:bg-white/10"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              aria-label={`Editar ${item.description}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleAction('approve', [item.id])}
                              aria-label={`Aprovar ${item.description}`}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleAction('reject', [item.id])}
                              aria-label={`Rejeitar ${item.description}`}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Story 7.2: Safe Open Finance Cleanup Zone */}
      {summary && (
        <section className="glass-card p-5 border-rose-400/35 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500" aria-hidden="true" />
              Limpeza Segura de Dados do Open Finance
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Atualmente existem <strong>{summary.transactions_open_finance}</strong> lançamento(s) importado(s) do Open Finance e{' '}
              <strong>{summary.pending_approval}</strong> na fila pendente. Lançamentos manuais e da Planilha 2026 nunca são apagados.
            </p>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={clearAutoCards}
                onChange={(e) => setClearAutoCards(e.target.checked)}
              />
              Também remover cartões criados automaticamente pelo Open Finance ({summary.auto_credit_cards})
            </label>
          </div>
          <button
            type="button"
            disabled={summary.transactions_open_finance === 0 && summary.pending_approval === 0 && !clearAutoCards}
            onClick={() => setCleanDialogOpen(true)}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold transition disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            Apagar dados do Open Finance
          </button>
        </section>
      )}

      <ConfirmDialog
        open={cleanDialogOpen}
        title="Apagar todos os dados importados do Open Finance?"
        description={`Serão removidos ${summary?.transactions_open_finance ?? 0} lançamento(s) do Open Finance e ${summary?.pending_approval ?? 0} pendência(s), recalculando os saldos das contas. Suas transações manuais e importadas da planilha permanecerão 100% intactas.`}
        confirmLabel="Sim, apagar dados do Open Finance"
        variant="danger"
        loading={cleaning}
        onConfirm={handleConfirmClean}
        onCancel={() => setCleanDialogOpen(false)}
      />
    </div>
  )
}

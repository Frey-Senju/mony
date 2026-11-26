'use client'

import React, { useState } from 'react'
import { X, ShieldCheck, ChevronDown, ChevronUp, Save } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface EditableTransaction {
  id: string
  account_id: string
  type: 'expense' | 'income' | 'transfer' | 'investment' | 'refund'
  amount: number
  description: string
  merchant_name?: string | null
  notes?: string | null
  transaction_date: string
  statement_month?: string | null
  payment_method?: string | null
  installment_number?: number | null
  installment_total?: number | null
  category_name?: string | null
  is_reconciled?: boolean
  source?: string
  external_id?: string | null
  user_edited?: boolean
  origin_metadata?: Record<string, unknown> | null
}

interface UniversalEditTransactionModalProps {
  token: string
  transaction: EditableTransaction
  accounts: Array<{ id: string; name: string }>
  categories: string[]
  onClose: () => void
  onSaved: () => void
}

const PAYMENT_OPTIONS = [
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'bank_transfer', label: 'Transferência' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'other', label: 'Outro' },
]

export function UniversalEditTransactionModal({
  token,
  transaction,
  accounts,
  categories,
  onClose,
  onSaved,
}: UniversalEditTransactionModalProps) {
  const [form, setForm] = useState({
    account_id: transaction.account_id,
    type: transaction.type,
    amount: String(transaction.amount),
    description: transaction.description || '',
    merchant_name: transaction.merchant_name || '',
    transaction_date: (transaction.transaction_date || '').slice(0, 10),
    statement_month: transaction.statement_month || (transaction.transaction_date || '').slice(0, 7),
    category_name: transaction.category_name || 'Outros',
    payment_method: transaction.payment_method || 'other',
    installment_number: transaction.installment_number ? String(transaction.installment_number) : '',
    installment_total: transaction.installment_total ? String(transaction.installment_total) : '',
    notes: transaction.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOrigin, setShowOrigin] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        account_id: form.account_id,
        type: form.type,
        amount: Number(form.amount),
        description: form.description.trim(),
        merchant_name: form.merchant_name.trim() || null,
        transaction_date: form.transaction_date,
        statement_month: form.statement_month || null,
        category_name: form.category_name,
        payment_method: form.payment_method,
        notes: form.notes.trim() || null,
        installment_number: form.installment_number ? Number(form.installment_number) : null,
        installment_total: form.installment_total ? Number(form.installment_total) : null,
      }
      const res = await fetch(`${API_URL}/transactions/${transaction.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Erro ao salvar alterações')
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mony:transactions-updated'))
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar lançamento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Editar transação completa"
    >
      <form
        onSubmit={handleSubmit}
        className="glass-modal max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Editar Lançamento (Todos os Campos)
            </h2>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Origem ({transaction.source || 'manual'}) e hash anti-duplicata preservados automaticamente
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1">Descrição</label>
            <input
              type="text"
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 glass-input rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Valor (R$)</label>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full px-3 py-2 glass-input rounded-xl text-sm font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Tipo</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as EditableTransaction['type'] })}
              className="w-full px-3 py-2 glass-input rounded-xl text-sm"
            >
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
              <option value="transfer">Transferência Interna</option>
              <option value="refund">Estorno / Reembolso</option>
              <option value="investment">Investimento</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Conta / Cartão</label>
            <select
              value={form.account_id}
              onChange={(e) => setForm({ ...form, account_id: e.target.value })}
              className="w-full px-3 py-2 glass-input rounded-xl text-sm"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Categoria</label>
            <select
              value={form.category_name}
              onChange={(e) => setForm({ ...form, category_name: e.target.value })}
              className="w-full px-3 py-2 glass-input rounded-xl text-sm"
            >
              {Array.from(new Set([...categories, form.category_name])).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Data da Compra</label>
            <input
              type="date"
              required
              value={form.transaction_date}
              onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
              className="w-full px-3 py-2 glass-input rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Mês de Competência / Fatura</label>
            <input
              type="month"
              value={form.statement_month}
              onChange={(e) => setForm({ ...form, statement_month: e.target.value })}
              className="w-full px-3 py-2 glass-input rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Forma de Pagamento</label>
            <select
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              className="w-full px-3 py-2 glass-input rounded-xl text-sm"
            >
              {PAYMENT_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Estabelecimento</label>
            <input
              type="text"
              value={form.merchant_name}
              onChange={(e) => setForm({ ...form, merchant_name: e.target.value })}
              placeholder="Opcional"
              className="w-full px-3 py-2 glass-input rounded-xl text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:col-span-2">
            <div>
              <label className="block text-xs font-semibold mb-1">Parcela Atual</label>
              <input
                type="number"
                min="1"
                value={form.installment_number}
                onChange={(e) => setForm({ ...form, installment_number: e.target.value })}
                placeholder="Ex.: 2"
                className="w-full px-3 py-2 glass-input rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Total de Parcelas</label>
              <input
                type="number"
                min="1"
                value={form.installment_total}
                onChange={(e) => setForm({ ...form, installment_total: e.target.value })}
                placeholder="Ex.: 10"
                className="w-full px-3 py-2 glass-input rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1">Observações</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 glass-input rounded-xl text-sm"
            />
          </div>
        </div>

        {/* Immutable Origin Inspector */}
        {transaction.origin_metadata && (
          <div className="rounded-xl bg-black/5 dark:bg-white/5 p-3 text-[11px]">
            <button
              type="button"
              onClick={() => setShowOrigin((v) => !v)}
              className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1"
            >
              {showOrigin ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Ver registro original imutável do banco (Open Finance)
            </button>
            {showOrigin && (
              <pre className="mt-2 text-[10px] font-mono text-slate-500 overflow-x-auto">
                {JSON.stringify(transaction.origin_metadata, null, 2)}
              </pre>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-xs font-semibold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}

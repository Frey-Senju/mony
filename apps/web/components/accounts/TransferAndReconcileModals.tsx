'use client'

import React, { useEffect, useState } from 'react'
import { ArrowLeftRight, Scale, X, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface MinimalAccount {
  id: string
  name: string
  type: string
  balance: number
  icon?: string | null
  color?: string | null
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

export function AccountTransferModal({
  open,
  accounts,
  initialFromId,
  token,
  onClose,
  onSuccess,
}: {
  open: boolean
  accounts: MinimalAccount[]
  initialFromId?: string | null
  token?: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const first = initialFromId || accounts[0]?.id || ''
    const second = accounts.find((a) => a.id !== first)?.id || ''
    setFromId(first)
    setToId(second)
    setAmount('')
    setDescription('')
    setTransferDate(new Date().toISOString().slice(0, 10))
    setErr(null)
  }, [open, initialFromId, accounts])

  if (!open) return null

  const fromAcc = accounts.find((a) => a.id === fromId)
  const toAcc = accounts.find((a) => a.id === toId)
  const numAmount = Math.max(0, Number(amount.replace(',', '.')) || 0)

  const handleSwap = () => {
    setFromId(toId)
    setToId(fromId)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (!fromId || !toId || fromId === toId) {
      setErr('Escolha contas de origem e destino diferentes.')
      return
    }
    if (numAmount <= 0) {
      setErr('Informe um valor maior que zero.')
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`${API_URL}/accounts/transfer`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_account_id: fromId,
          to_account_id: toId,
          amount: numAmount.toFixed(2),
          transfer_date: transferDate,
          description: description.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.detail || 'Não foi possível concluir a transferência.')
      }
      dispatchToast(
        `Transferência de ${brl(numAmount)} concluída: ${fromAcc?.name} → ${toAcc?.name}`,
        'success'
      )
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mony:transactions-updated'))
      }
      onSuccess()
      onClose()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Erro ao transferir')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-modal-title"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-lg p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm"
              style={{ background: 'var(--accent)' }}
            >
              <ArrowLeftRight className="w-5 h-5" />
            </span>
            <div>
              <h2 id="transfer-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Transferir Entre Contas
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Movimenta saldos atomicamente sem distorcer receitas ou despesas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-2 rounded-xl text-slate-500 hover:bg-white/60 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Conta de Origem
              </label>
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="liquid-input w-full text-sm"
                required
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.icon || '🏦'} {a.name} ({brl(a.balance)})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleSwap}
              title="Inverter origem e destino"
              aria-label="Inverter origem e destino"
              className="liquid-btn liquid-btn-glass p-2.5 rounded-xl self-center sm:mb-0.5"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Conta de Destino
              </label>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="liquid-input w-full text-sm"
                required
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.icon || '🏦'} {a.name} ({brl(a.balance)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Valor (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="liquid-input w-full text-sm font-semibold tabular-nums"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Data
              </label>
              <input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="liquid-input w-full text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Descrição (opcional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                fromAcc && toAcc ? `Transferência ${fromAcc.name} → ${toAcc.name}` : 'Ex.: Aporte na corretora'
              }
              className="liquid-input w-full text-sm"
            />
          </div>

          {/* Live Before -> After Balance Preview */}
          {fromAcc && toAcc && fromId !== toId && numAmount > 0 && (
            <div className="glass-card p-3.5 space-y-2 text-xs">
              <p className="font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[10px]">
                Prévia dos Saldos Após Transferência
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-700 dark:text-slate-200 font-medium">
                  {fromAcc.icon || '🏦'} {fromAcc.name}
                </span>
                <span className="inline-flex items-center gap-1.5 tabular-nums money-value">
                  <span className="text-slate-500">{brl(fromAcc.balance)}</span>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                  <strong className="text-rose-600 dark:text-rose-400">
                    {brl(Number(fromAcc.balance) - numAmount)}
                  </strong>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-700 dark:text-slate-200 font-medium">
                  {toAcc.icon || '🏦'} {toAcc.name}
                </span>
                <span className="inline-flex items-center gap-1.5 tabular-nums money-value">
                  <span className="text-slate-500">{brl(toAcc.balance)}</span>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {brl(Number(toAcc.balance) + numAmount)}
                  </strong>
                </span>
              </div>
            </div>
          )}

          {err && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {err}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || accounts.length < 2}
              className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {saving ? 'Transferindo...' : 'Confirmar Transferência'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function AccountReconcileModal({
  account,
  token,
  onClose,
  onSuccess,
}: {
  account: MinimalAccount | null
  token?: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [actualBalance, setActualBalance] = useState('')
  const [createAdj, setCreateAdj] = useState(true)
  const [description, setDescription] = useState('Ajuste de conciliação de saldo')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!account) return
    setActualBalance(String(Number(account.balance || 0).toFixed(2)))
    setCreateAdj(true)
    setDescription('Ajuste de conciliação de saldo')
    setErr(null)
  }, [account])

  if (!account) return null

  const currentVal = Number(account.balance || 0)
  const parsedTarget = Number(actualBalance.replace(',', '.'))
  const isValid = actualBalance.trim() !== '' && !Number.isNaN(parsedTarget)
  const delta = isValid ? parsedTarget - currentVal : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !isValid) return
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`${API_URL}/accounts/${account.id}/reconcile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actual_balance: parsedTarget.toFixed(2),
          create_adjustment_transaction: createAdj,
          description: description.trim() || 'Ajuste de conciliação de saldo',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Erro ao conciliar saldo')
      dispatchToast(
        `Saldo de ${account.name} conciliado para ${brl(parsedTarget)}!`,
        'success'
      )
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mony:transactions-updated'))
      }
      onSuccess()
      onClose()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Erro ao conciliar saldo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reconcile-modal-title"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-md p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl flex items-center justify-center bg-emerald-500 text-white shadow-sm">
              <Scale className="w-5 h-5" />
            </span>
            <div>
              <h2 id="reconcile-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Conciliar Saldo Real
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {account.icon || '🏦'} {account.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-2 rounded-xl text-slate-500 hover:bg-white/60 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="glass-card p-3.5 flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-300">Saldo atual no Mony</span>
            <strong className="text-slate-900 dark:text-white tabular-nums money-value">
              {brl(currentVal)}
            </strong>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Qual saldo aparece no app do seu banco hoje? (R$)
            </label>
            <input
              type="number"
              step="0.01"
              value={actualBalance}
              onChange={(e) => setActualBalance(e.target.value)}
              className="liquid-input w-full text-base font-bold tabular-nums"
              required
              autoFocus
            />
          </div>

          {isValid && Math.abs(delta) >= 0.01 && (
            <div
              className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between ${
                delta > 0
                  ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-400/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              <span>Diferença detectada:</span>
              <strong className="text-sm tabular-nums money-value">
                {delta > 0 ? '+' : ''}
                {brl(delta)}
              </strong>
            </div>
          )}

          <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={createAdj}
              onChange={(e) => setCreateAdj(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-blue-600"
            />
            <span>
              Registrar automaticamente lançamento de ajuste (<code>#conciliacao</code>) para manter histórico auditável
            </span>
          </label>

          {createAdj && (
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição do ajuste"
              className="liquid-input w-full text-xs"
            />
          )}

          {err && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {err}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !isValid}
              className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Conciliando...' : 'Aplicar Conciliação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

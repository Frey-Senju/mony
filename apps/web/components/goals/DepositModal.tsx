'use client'

import React, { useEffect, useState } from 'react'
import { X, PlusCircle } from 'lucide-react'
import type { Goal } from '@/hooks/useGoals'

interface DepositModalProps {
  open: boolean
  goal: Goal | null
  onClose: () => void
  onSubmit: (id: string, amount: number) => Promise<void>
}

const QUICK_AMOUNTS = [100, 250, 500, 1000]

export function DepositModal({ open, goal, onClose, onSubmit }: DepositModalProps) {
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAmount('')
    setError(null)
  }, [open])

  if (!open || !goal) return null

  const remaining = Math.max(0, Number(goal.remaining_amount) || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = parseFloat(amount.replace(',', '.'))
    if (isNaN(value) || value <= 0) {
      setError('Informe um valor válido')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(goal.id, value)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao depositar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="glass-modal w-full max-w-sm p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 truncate">
            <PlusCircle className="w-4 h-4 text-blue-500 shrink-0" aria-hidden="true" />
            <span className="truncate">Depositar em &ldquo;{goal.name}&rdquo;</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal de depósito"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300">
          Faltam{' '}
          <strong className="text-slate-900 dark:text-white money-value">
            {remaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </strong>{' '}
          para atingir esta meta.
        </p>

        {/* Quick Deposit Amount Pills */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Valores rápidos de aporte">
          {QUICK_AMOUNTS.map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setAmount(String(val))}
              className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/60 dark:bg-white/10 hover:bg-blue-500/15 border border-white/70 dark:border-white/15 text-slate-700 dark:text-slate-200 transition"
            >
              + R$ {val.toLocaleString('pt-BR')}
            </button>
          ))}
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setAmount(remaining.toFixed(2))}
              className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 transition"
            >
              Completar meta
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Valor a depositar (R$)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0.01"
              step="0.01"
              placeholder="500.00"
              autoFocus
              className="input-base text-sm font-bold"
            />
          </div>

          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-xs font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
            >
              {submitting ? 'Depositando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

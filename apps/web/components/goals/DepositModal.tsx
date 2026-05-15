'use client'

import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Goal } from '@/hooks/useGoals'

interface DepositModalProps {
  open: boolean
  goal: Goal | null
  onClose: () => void
  onSubmit: (id: string, amount: number) => Promise<void>
}

export function DepositModal({ open, goal, onClose, onSubmit }: DepositModalProps) {
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAmount('')
    setError(null)
  }, [open])

  if (!open || !goal) return null

  const remaining = Number(goal.remaining_amount)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = parseFloat(amount)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Depositar em &ldquo;{goal.name}&rdquo;
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Faltam{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {remaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>{' '}
          para atingir a meta.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
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
              className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md"
            >
              {submitting ? 'Depositando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

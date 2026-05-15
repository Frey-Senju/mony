'use client'

import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Budget } from '@/hooks/useBudgets'

interface BudgetFormModalProps {
  open: boolean
  editingBudget?: Budget | null
  onClose: () => void
  onSubmit: (data: { category: string; limit_amount: number }) => Promise<void>
}

export function BudgetFormModal({ open, editingBudget, onClose, onSubmit }: BudgetFormModalProps) {
  const [category, setCategory] = useState('')
  const [limitAmount, setLimitAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editingBudget) {
      setCategory(editingBudget.category)
      setLimitAmount(String(editingBudget.limit_amount))
    } else {
      setCategory('')
      setLimitAmount('')
    }
    setError(null)
  }, [editingBudget, open])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(limitAmount)
    if (!category.trim() || isNaN(amount) || amount <= 0) {
      setError('Preencha todos os campos corretamente')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({ category: category.trim(), limit_amount: amount })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar budget')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {editingBudget ? 'Editar Budget' : 'Novo Budget'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Categoria
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={!!editingBudget}
              placeholder="Ex: Alimentação"
              className="w-full border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Limite mensal (R$)
            </label>
            <input
              type="number"
              value={limitAmount}
              onChange={(e) => setLimitAmount(e.target.value)}
              min="0.01"
              step="0.01"
              placeholder="500.00"
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
              {submitting ? 'Salvando...' : editingBudget ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

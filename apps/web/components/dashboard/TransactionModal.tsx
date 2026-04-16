'use client'

import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface Transaction {
  id: string
  description: string
  amount: number
  type: 'income' | 'expense'
  transaction_date: string
  merchant_name?: string
  is_reconciled: boolean
  currency: string
  notes?: string
}

interface TransactionModalProps {
  transaction?: Transaction
  isOpen: boolean
  onClose: () => void
  onSave: (data: Partial<Transaction>) => Promise<void>
  loading?: boolean
}

export function TransactionModal({
  transaction,
  isOpen,
  onClose,
  onSave,
  loading = false,
}: TransactionModalProps) {
  const [formData, setFormData] = useState<Partial<Transaction>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (transaction) {
      setFormData(transaction)
    } else {
      setFormData({
        type: 'expense',
        currency: 'BRL',
      })
    }
    setErrors({})
  }, [transaction, isOpen])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.description?.trim()) {
      newErrors.description = 'Descrição é obrigatória'
    }

    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = 'Valor deve ser maior que zero'
    }

    if (!formData.transaction_date) {
      newErrors.transaction_date = 'Data é obrigatória'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSaving(true)
    try {
      const dataToSave: Partial<Transaction> = {
        description: formData.description,
        amount: formData.amount,
        type: formData.type,
        transaction_date: formData.transaction_date,
        merchant_name: formData.merchant_name,
        notes: formData.notes,
      }

      await onSave(dataToSave)
      onClose()
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : 'Erro ao salvar transação',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {transaction ? 'Editar Transação' : 'Nova Transação'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errors.submit && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
              {errors.submit}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Descrição *
            </label>
            <input
              type="text"
              name="description"
              value={formData.description || ''}
              onChange={handleChange}
              placeholder="Ex: Café na Starbucks"
              className={`w-full px-4 py-2 rounded border ${
                errors.description
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800'
              } text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500`}
              disabled={isSaving}
            />
            {errors.description && (
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">
                {errors.description}
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Valor (R$) *
            </label>
            <input
              type="number"
              name="amount"
              value={formData.amount || ''}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              min="0"
              className={`w-full px-4 py-2 rounded border ${
                errors.amount
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800'
              } text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500`}
              disabled={isSaving}
            />
            {errors.amount && (
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">
                {errors.amount}
              </p>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tipo *
            </label>
            <select
              name="type"
              value={formData.type || 'expense'}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSaving}
            >
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </select>
          </div>

          {/* Transaction Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Data *
            </label>
            <input
              type="date"
              name="transaction_date"
              value={formData.transaction_date || ''}
              onChange={handleChange}
              className={`w-full px-4 py-2 rounded border ${
                errors.transaction_date
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800'
              } text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500`}
              disabled={isSaving}
            />
            {errors.transaction_date && (
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">
                {errors.transaction_date}
              </p>
            )}
          </div>

          {/* Merchant Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Comerciante (Opcional)
            </label>
            <input
              type="text"
              name="merchant_name"
              value={formData.merchant_name || ''}
              onChange={handleChange}
              placeholder="Ex: Starbucks Coffee"
              className="w-full px-4 py-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSaving}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Notas (Opcional)
            </label>
            <textarea
              name="notes"
              value={formData.notes || ''}
              onChange={handleChange}
              placeholder="Observações adicionais..."
              rows={3}
              className="w-full px-4 py-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSaving}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              disabled={isSaving || loading}
            >
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

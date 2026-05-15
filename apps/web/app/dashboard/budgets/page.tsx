'use client'

import React, { useState } from 'react'
import { Plus, AlertTriangle } from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { BudgetCard } from '@/components/budgets/BudgetCard'
import { BudgetFormModal } from '@/components/budgets/BudgetFormModal'
import { useBudgets, type Budget } from '@/hooks/useBudgets'
import { useAuth } from '@/stores/auth/useAuth'

export default function BudgetsPage() {
  return (
    <PrivateRoute>
      <BudgetsContent />
    </PrivateRoute>
  )
}

function BudgetsContent() {
  const auth = useAuth()
  const { budgets, loading, error, addBudget, editBudget, removeBudget } = useBudgets(
    auth.tokens?.access_token
  )
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const exceededCount = budgets.filter((b) => b.alert_level === 'exceeded').length
  const warningCount = budgets.filter((b) => b.alert_level === 'warning').length

  const handleOpenCreate = () => {
    setEditingBudget(null)
    setModalOpen(true)
  }

  const handleOpenEdit = (budget: Budget) => {
    setEditingBudget(budget)
    setModalOpen(true)
  }

  const handleSubmit = async (data: { category: string; limit_amount: number }) => {
    if (editingBudget) {
      await editBudget(editingBudget.id, { limit_amount: data.limit_amount })
    } else {
      await addBudget(data)
    }
  }

  const handleDelete = async (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id)
      return
    }
    await removeBudget(id)
    setDeleteConfirm(null)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Budgets</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Limites de gasto por categoria no mês atual
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Budget
        </button>
      </div>

      {(exceededCount > 0 || warningCount > 0) && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            {exceededCount > 0 && `${exceededCount} budget${exceededCount > 1 ? 's' : ''} ultrapassado${exceededCount > 1 ? 's' : ''}`}
            {exceededCount > 0 && warningCount > 0 && ' • '}
            {warningCount > 0 && `${warningCount} próximo${warningCount > 1 ? 's' : ''} do limite`}
          </span>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && budgets.length === 0 && (
        <div className="text-center py-16">
          <div className="text-slate-400 dark:text-slate-500 mb-4">
            <AlertTriangle className="w-12 h-12 mx-auto" />
          </div>
          <p className="text-slate-600 dark:text-slate-400 font-medium">Nenhum budget criado</p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
            Crie limites de gasto por categoria para controlar suas finanças.
          </p>
          <button
            onClick={handleOpenCreate}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md"
          >
            Criar primeiro budget
          </button>
        </div>
      )}

      {!loading && budgets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {budgets.map((budget) => (
            <div key={budget.id}>
              <BudgetCard
                budget={budget}
                onEdit={handleOpenEdit}
                onDelete={handleDelete}
              />
              {deleteConfirm === budget.id && (
                <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between gap-2">
                  <p className="text-xs text-red-700 dark:text-red-300">Confirmar exclusão?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleDelete(budget.id)}
                      className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <BudgetFormModal
        open={modalOpen}
        editingBudget={editingBudget}
        onClose={() => { setModalOpen(false); setEditingBudget(null) }}
        onSubmit={handleSubmit}
      />
    </div>
  )
}

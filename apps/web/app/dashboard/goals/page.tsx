'use client'

import React, { useState } from 'react'
import { Target, Plus } from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { GoalCard } from '@/components/goals/GoalCard'
import { GoalFormModal } from '@/components/goals/GoalFormModal'
import { DepositModal } from '@/components/goals/DepositModal'
import { useGoals, type Goal } from '@/hooks/useGoals'

export default function GoalsPage() {
  return (
    <PrivateRoute>
      <GoalsContent />
    </PrivateRoute>
  )
}

function GoalsContent() {
  const { goals, loading, error, addGoal, editGoal, deposit, removeGoal } = useGoals()
  const [formOpen, setFormOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [depositGoal, setDepositGoal] = useState<Goal | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleFormSubmit = async (data: {
    name: string
    target_amount: number
    description?: string
    target_date?: string
  }) => {
    setActionError(null)
    try {
      if (editingGoal) {
        await editGoal(editingGoal.id, data)
      } else {
        await addGoal(data)
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao salvar meta')
      throw e
    }
  }

  const handleDeposit = async (id: string, amount: number) => {
    setActionError(null)
    try {
      await deposit(id, amount)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao depositar')
      throw e
    }
  }

  const handleDelete = async (id: string) => {
    setActionError(null)
    try {
      await removeGoal(id)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao excluir meta')
    } finally {
      setDeleteConfirm(null)
    }
  }

  const activeGoals = goals.filter((g) => !g.is_achieved)
  const achievedGoals = goals.filter((g) => g.is_achieved)

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Metas Financeiras</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Acompanhe seus objetivos e registre depósitos incrementais
          </p>
        </div>
        <button
          onClick={() => { setEditingGoal(null); setFormOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Meta
        </button>
      </div>

      {(error || actionError) && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error ?? actionError}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Nenhuma meta criada ainda.</p>
          <p className="text-sm">Clique em &quot;Nova Meta&quot; para começar.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeGoals.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                Em andamento ({activeGoals.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeGoals.map((goal) => (
                  deleteConfirm === goal.id ? (
                    <div key={goal.id} className="border rounded-lg p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                      <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">
                        Excluir <span className="font-medium">&quot;{goal.name}&quot;</span>?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(goal.id)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                        >
                          Excluir
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      onEdit={(g) => { setEditingGoal(g); setFormOpen(true) }}
                      onDeposit={(g) => setDepositGoal(g)}
                      onDelete={(id) => setDeleteConfirm(id)}
                    />
                  )
                ))}
              </div>
            </div>
          )}

          {achievedGoals.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                Concluídas ({achievedGoals.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {achievedGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onEdit={(g) => { setEditingGoal(g); setFormOpen(true) }}
                    onDeposit={(g) => setDepositGoal(g)}
                    onDelete={(id) => setDeleteConfirm(id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <GoalFormModal
        open={formOpen}
        editingGoal={editingGoal}
        onClose={() => { setFormOpen(false); setEditingGoal(null) }}
        onSubmit={handleFormSubmit}
      />

      <DepositModal
        open={!!depositGoal}
        goal={depositGoal}
        onClose={() => setDepositGoal(null)}
        onSubmit={handleDeposit}
      />
    </div>
  )
}

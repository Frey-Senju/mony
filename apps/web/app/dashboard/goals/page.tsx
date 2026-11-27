'use client'

import React, { useMemo, useState } from 'react'
import { Target, Plus, Sparkles, TrendingUp, CheckCircle2, Calendar } from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { GoalCard } from '@/components/goals/GoalCard'
import { GoalFormModal } from '@/components/goals/GoalFormModal'
import { DepositModal } from '@/components/goals/DepositModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useGoals, type Goal } from '@/hooks/useGoals'
import { dispatchToast } from '@/components/ui/ToastProvider'

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

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
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null)
  const [deletingGoal, setDeletingGoal] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [monthlyContribution, setMonthlyContribution] = useState(1000)
  const [cdiRatePct, setCdiRatePct] = useState(11.0)

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
        dispatchToast('Meta atualizada com sucesso!', 'success')
      } else {
        await addGoal(data)
        dispatchToast('Nova meta criada com sucesso!', 'success')
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
      dispatchToast(`Aporte de ${brl(amount)} registrado na meta!`, 'success')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao depositar')
      throw e
    }
  }

  const executeDeleteGoal = async () => {
    if (!deleteTarget) return
    setActionError(null)
    setDeletingGoal(true)
    const removed = deleteTarget
    try {
      await removeGoal(removed.id)
      setDeleteTarget(null)
      dispatchToast(`Meta "${removed.name}" removida.`, 'info', {
        action: {
          label: 'Desfazer',
          onClick: async () => {
            await addGoal({
              name: removed.name,
              target_amount: Number(removed.target_amount),
              description: removed.description || undefined,
              target_date: removed.target_date || undefined,
            })
            dispatchToast(`Meta "${removed.name}" recriada!`, 'success')
          },
        },
      })
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erro ao excluir meta')
    } finally {
      setDeletingGoal(false)
    }
  }

  const activeGoals = goals.filter((g) => !g.is_achieved)
  const achievedGoals = goals.filter((g) => g.is_achieved)

  const totals = useMemo(() => {
    const target = goals.reduce((s, g) => s + Number(g.target_amount || 0), 0)
    const current = goals.reduce((s, g) => s + Number(g.current_amount || 0), 0)
    const remaining = Math.max(0, target - current)
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
    // Estimate months to finish all active goals investing at CDI
    const r = Math.pow(1 + cdiRatePct / 100, 1 / 12) - 1
    let bal = current
    let months = 0
    if (remaining > 0 && monthlyContribution > 0) {
      while (bal < target && months < 360) {
        bal = bal * (1 + r) + monthlyContribution
        months += 1
      }
    }
    return { target, current, remaining, pct, monthsToFinish: months }
  }, [goals, monthlyContribution, cdiRatePct])

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Liquid Glass */}
      <header className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ background: 'var(--accent)' }}
            aria-hidden="true"
          >
            <Target className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Metas Financeiras 2.0
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              Planeje objetivos com simulação de aportes mensais e rendimento CDI
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingGoal(null)
            setFormOpen(true)
          }}
          className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Nova Meta
        </button>
      </header>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Acumulado nas Metas</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 money-value">
            {brl(totals.current)}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Objetivo Total</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 money-value">
            {brl(totals.target)}
          </p>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Progresso Geral</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{totals.pct}%</p>
          <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-white/10 mt-2 overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${totals.pct}%` }} />
          </div>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Conquistadas</p>
          <p className="text-2xl font-bold text-violet-600 dark:text-violet-400 mt-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            {achievedGoals.length} / {goals.length}
          </p>
        </div>
      </div>

      {/* Interactive CDI & Monthly Contribution Simulator */}
      {goals.length > 0 && totals.remaining > 0 && (
        <section className="glass-panel border-blue-400/30 space-y-3" aria-label="Simulador de conquista de metas com CDI">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Sparkles className="w-4 h-4 text-violet-500" aria-hidden="true" />
            Acelerador de Metas (Rendimento CDI + Aporte Mensal)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div>
              <label htmlFor="goal-contrib" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Aporte mensal planejado: <strong>{brl(monthlyContribution)}</strong>
              </label>
              <input
                id="goal-contrib"
                type="range"
                min={100}
                max={15000}
                step={100}
                value={monthlyContribution}
                onChange={(e) => setMonthlyContribution(Number(e.target.value))}
                className="w-full accent-primary-600"
              />
            </div>
            <div>
              <label htmlFor="goal-cdi" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Rendimento anual (CDI/Selic): <strong>{cdiRatePct.toFixed(1)}% a.a.</strong>
              </label>
              <input
                id="goal-cdi"
                type="range"
                min={0}
                max={16}
                step={0.5}
                value={cdiRatePct}
                onChange={(e) => setCdiRatePct(Number(e.target.value))}
                className="w-full accent-primary-600"
              />
            </div>
            <div className="glass-card p-3.5 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />
              <div className="text-xs">
                <p className="text-slate-500 dark:text-slate-400">Tempo estimado p/ quitar todas</p>
                <p className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
                  {totals.monthsToFinish >= 360
                    ? '30+ anos'
                    : totals.monthsToFinish >= 12
                    ? `${Math.floor(totals.monthsToFinish / 12)}a ${totals.monthsToFinish % 12}m`
                    : `${totals.monthsToFinish} meses`}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {(error || actionError) && (
        <div
          role="alert"
          className="glass-card p-4 border-rose-400/50 text-sm text-rose-700 dark:text-rose-300"
        >
          {error ?? actionError}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 glass-card animate-pulse" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <div className="glass-panel text-center py-14 space-y-3">
          <Target className="w-12 h-12 text-slate-400 mx-auto" aria-hidden="true" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Nenhuma meta cadastrada ainda
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
            Defina objetivos como Reserva de Emergência, Viagem ou Imóvel e acompanhe o progresso mês a mês com projeção de juros compostos.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingGoal(null)
              setFormOpen(true)
            }}
            className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold mt-2"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Criar primeira meta
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {activeGoals.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Em andamento ({activeGoals.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeGoals.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    onDeposit={() => setDepositGoal(g)}
                    onEdit={() => {
                      setEditingGoal(g)
                      setFormOpen(true)
                    }}
                    onDelete={() => setDeleteTarget(g)}
                  />
                ))}
              </div>
            </section>
          )}

          {achievedGoals.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Conquistadas ({achievedGoals.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {achievedGoals.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    onDeposit={() => setDepositGoal(g)}
                    onEdit={() => {
                      setEditingGoal(g)
                      setFormOpen(true)
                    }}
                    onDelete={() => setDeleteTarget(g)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <GoalFormModal
        open={formOpen}
        editingGoal={editingGoal}
        onClose={() => {
          setFormOpen(false)
          setEditingGoal(null)
        }}
        onSubmit={handleFormSubmit}
      />

      <DepositModal
        open={Boolean(depositGoal)}
        goal={depositGoal}
        onClose={() => setDepositGoal(null)}
        onSubmit={handleDeposit}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Excluir a meta "${deleteTarget?.name || ''}"?`}
        description="Você poderá recriar a meta logo em seguida clicando em Desfazer."
        confirmLabel="Excluir"
        variant="danger"
        loading={deletingGoal}
        onConfirm={executeDeleteGoal}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

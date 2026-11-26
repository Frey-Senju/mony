'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Plus, AlertTriangle, Sparkles, Check, RefreshCw, PieChart } from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { BudgetCard } from '@/components/budgets/BudgetCard'
import { BudgetFormModal } from '@/components/budgets/BudgetFormModal'
import { useBudgets, type Budget } from '@/hooks/useBudgets'
import { useAuth } from '@/stores/auth/useAuth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface BudgetRecommendation {
  action: 'create' | 'adjust'
  budget_id?: string | null
  category: string
  current_limit?: number | null
  avg_monthly_spend: number
  suggested_limit: number
  pct_of_income: number
  reason: string
}

interface BudgetAISuggestionsPayload {
  avg_monthly_income: number
  months_analyzed: number
  total_budgeted: number
  budgeted_pct_of_income: number
  recommended_essential_cap: number
  recommended_lifestyle_cap: number
  recommended_invest_target: number
  recommendations: BudgetRecommendation[]
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

export default function BudgetsPage() {
  return (
    <PrivateRoute>
      <BudgetsContent />
    </PrivateRoute>
  )
}

function BudgetsContent() {
  const auth = useAuth()
  const token = auth.tokens?.access_token
  const { budgets, loading, error, addBudget, editBudget, removeBudget } = useBudgets(token)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [aiPlan, setAiPlan] = useState<BudgetAISuggestionsPayload | null>(null)
  const [loadingAI, setLoadingAI] = useState(false)
  const [applyingCat, setApplyingCat] = useState<string | null>(null)
  const [aiBanner, setAiBanner] = useState<string | null>(null)

  const loadAISuggestions = useCallback(async () => {
    if (!token) return
    setLoadingAI(true)
    try {
      const res = await fetch(`${API_URL}/budgets/ai-suggestions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setAiPlan(await res.json())
      }
    } finally {
      setLoadingAI(false)
    }
  }, [token])

  useEffect(() => {
    loadAISuggestions()
  }, [loadAISuggestions, budgets.length])

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
    await loadAISuggestions()
  }

  const handleDelete = async (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id)
      return
    }
    await removeBudget(id)
    setDeleteConfirm(null)
    await loadAISuggestions()
  }

  const applyRecommendation = async (rec: BudgetRecommendation) => {
    setApplyingCat(rec.category)
    setAiBanner(null)
    try {
      if (rec.action === 'adjust' && rec.budget_id) {
        await editBudget(rec.budget_id, { limit_amount: rec.suggested_limit })
      } else {
        await addBudget({ category: rec.category, limit_amount: rec.suggested_limit })
      }
      setAiBanner(`Budget de ${rec.category} configurado para ${brl(rec.suggested_limit)}!`)
      await loadAISuggestions()
    } finally {
      setApplyingCat(null)
    }
  }

  const applyAllRecommendations = async () => {
    if (!aiPlan) return
    setApplyingCat('__all__')
    try {
      for (const rec of aiPlan.recommendations) {
        if (rec.action === 'adjust' && rec.budget_id) {
          await editBudget(rec.budget_id, { limit_amount: rec.suggested_limit })
        } else {
          await addBudget({ category: rec.category, limit_amount: rec.suggested_limit })
        }
      }
      setAiBanner(`${aiPlan.recommendations.length} sugestões da Mony IA aplicadas aos seus budgets!`)
      await loadAISuggestions()
    } finally {
      setApplyingCat(null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Liquid Glass */}
      <header className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <PieChart className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Budgets Inteligentes
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Limites mensais por categoria com sugestões proativas da Mony IA baseadas na sua renda média e histórico real.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo Budget
        </button>
      </header>

      {/* Income vs Budgeted Summary KPIs */}
      {aiPlan && (
        <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="glass-card p-4">
            <p className="text-xs text-slate-500">Renda Média Mensal ({aiPlan.months_analyzed}m)</p>
            <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
              {brl(aiPlan.avg_monthly_income)}
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-slate-500">Total em Budgets Ativos</p>
            <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
              {brl(aiPlan.total_budgeted)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {aiPlan.budgeted_pct_of_income.toFixed(1)}% da renda média
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-slate-500">Teto Essenciais (60%)</p>
            <p className="text-xl font-bold text-[var(--accent)] mt-1">
              {brl(aiPlan.recommended_essential_cap)}
            </p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-slate-500">Estilo de Vida (30%) · Meta Aporte (10%)</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white mt-2">
              {brl(aiPlan.recommended_lifestyle_cap)} ·{' '}
              <span className="text-emerald-600">{brl(aiPlan.recommended_invest_target)}</span>
            </p>
          </div>
        </section>
      )}

      {/* Proactive AI Recommendations Panel (Story 5.5) */}
      <section className="glass-panel p-5 border border-[var(--accent)]/35 bg-[var(--accent-soft)]/15 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Sugestões Proativas da Mony IA ({aiPlan?.recommendations.length || 0})
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadAISuggestions}
              disabled={loadingAI}
              className="liquid-btn liquid-btn-glass px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingAI ? 'animate-spin' : ''}`} />
              Recalcular
            </button>
            {aiPlan && aiPlan.recommendations.length > 0 && (
              <button
                type="button"
                onClick={applyAllRecommendations}
                disabled={applyingCat !== null}
                className="liquid-btn liquid-btn-primary px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {applyingCat === '__all__' ? 'Aplicando...' : 'Aplicar Plano Sugerido'}
              </button>
            )}
          </div>
        </div>

        {aiBanner && (
          <div className="glass-card p-3 border-emerald-400/50 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {aiBanner}
          </div>
        )}

        {loadingAI && !aiPlan ? (
          <p className="text-xs text-slate-500">Analisando sua renda média e histórico de gastos...</p>
        ) : !aiPlan || aiPlan.recommendations.length === 0 ? (
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Seus budgets estão bem calibrados em relação aos seus gastos médios recentes!
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {aiPlan.recommendations.map((rec) => (
              <div key={rec.category} className="glass-card p-3.5 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {rec.category}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent)]">
                      {rec.action === 'create' ? 'Novo Budget' : 'Ajuste Sugerido'} · {brl(rec.suggested_limit)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    {rec.reason}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">
                    Média real: {brl(rec.avg_monthly_spend)}/mês
                  </span>
                  <button
                    type="button"
                    disabled={applyingCat !== null}
                    onClick={() => applyRecommendation(rec)}
                    className="liquid-btn liquid-btn-primary px-3 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <Check className="w-3 h-3" />
                    {applyingCat === rec.category
                      ? 'Salvando...'
                      : rec.action === 'create'
                        ? 'Criar Budget'
                        : 'Ajustar Limite'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {(exceededCount > 0 || warningCount > 0) && (
        <div className="glass-card p-3.5 border-amber-400/50 bg-amber-500/10 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
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
            <div key={i} className="h-28 glass-card animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="glass-card p-4 border-rose-400/50 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {!loading && !error && budgets.length === 0 && (
        <div className="glass-panel text-center py-12 space-y-2">
          <AlertTriangle className="w-10 h-10 mx-auto text-slate-400" />
          <p className="text-slate-700 dark:text-slate-200 font-semibold">Nenhum budget criado</p>
          <p className="text-xs text-slate-500">
            Use as sugestões da Mony IA acima ou crie manualmente seu primeiro limite por categoria.
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="mt-2 liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold"
          >
            Criar primeiro budget
          </button>
        </div>
      )}

      {!loading && budgets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              onEdit={handleOpenEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <BudgetFormModal
        open={modalOpen}
        editingBudget={editingBudget}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}

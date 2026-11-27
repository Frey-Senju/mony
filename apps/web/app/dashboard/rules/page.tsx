'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  Sparkles,
  ArrowLeftRight,
  Tag,
  AlertCircle,
  RefreshCw,
  Power,
  Search,
  FlaskConical,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { dispatchToast } from '@/components/ui/ToastProvider'
import { useAuth } from '@/stores/auth/useAuth'
import { useCategories } from '@/hooks/useCategories'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface RuleItem {
  id: string
  pattern: string
  match_field: 'any' | 'description' | 'merchant'
  action: 'categorize' | 'mark_transfer'
  category_name?: string | null
  priority: number
  is_active: boolean
  matches_count: number
}

interface PresetRule {
  pattern: string
  action: 'categorize' | 'mark_transfer'
  category_name?: string | null
  label: string
}

interface RulesSummary {
  total_rules: number
  active_rules: number
  total_matches: number
  transfers_excluded: number
}

interface ApplyReport {
  scanned: number
  categorized: number
  transfers_by_rule: number
  transfers_by_heuristic: number
  paired_transfers_detected: number
  total_updated: number
}

export default function RulesPage() {
  return (
    <PrivateRoute>
      <RulesContent />
    </PrivateRoute>
  )
}

function RulesContent() {
  const { tokens } = useAuth()
  const token = tokens?.access_token || ''
  const { categories } = useCategories(token)

  const [rules, setRules] = useState<RuleItem[]>([])
  const [presets, setPresets] = useState<PresetRule[]>([])
  const [summary, setSummary] = useState<RulesSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastReport, setLastReport] = useState<ApplyReport | null>(null)
  const [testSample, setTestSample] = useState('')
  const [ruleSearch, setRuleSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<RuleItem | null>(null)
  const [deletingRule, setDeletingRule] = useState(false)

  const catMetaByName = React.useMemo(() => {
    const map: Record<string, { color: string; icon?: string }> = {}
    for (const c of categories) {
      map[c.name.toLowerCase()] = { color: c.color, icon: c.icon }
    }
    return map
  }, [categories])

  const [form, setForm] = useState({
    pattern: '',
    match_field: 'any' as 'any' | 'description' | 'merchant',
    action: 'categorize' as 'categorize' | 'mark_transfer',
    category_name: 'Alimentação',
    priority: 100,
    apply_now: true,
  })

  const loadRules = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/rules`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Falha ao carregar regras')
      const data = await res.json()
      setRules(data.rules || [])
      setPresets(data.presets || [])
      setSummary(data.summary || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar regras')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !form.pattern.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/rules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          pattern: form.pattern.trim(),
          category_name: form.action === 'categorize' ? form.category_name : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Erro ao salvar regra')
      }
      const data = await res.json()
      if (data.applied) setLastReport(data.applied)
      setForm((prev) => ({ ...prev, pattern: '' }))
      dispatchToast(
        `Regra "${form.pattern.trim()}" criada!` +
          (data.applied?.total_updated
            ? ` ${data.applied.total_updated} lançamento(s) atualizado(s).`
            : ''),
        'success'
      )
      await loadRules()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mony:transactions-updated'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar regra')
    } finally {
      setSaving(false)
    }
  }

  const handleQuickPreset = async (preset: PresetRule) => {
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/rules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pattern: preset.pattern,
          match_field: 'any',
          action: preset.action,
          category_name: preset.category_name,
          priority: 50,
          apply_now: true,
        }),
      })
      if (!res.ok) throw new Error('Não foi possível aplicar o modelo')
      const data = await res.json()
      if (data.applied) setLastReport(data.applied)
      dispatchToast(`Modelo "${preset.label}" ativado com sucesso!`, 'success')
      await loadRules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar regra rápida')
    } finally {
      setSaving(false)
    }
  }

  const handleApplyAll = async () => {
    if (!token) return
    setApplying(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/rules/apply`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ days_back: 365 }),
      })
      if (!res.ok) throw new Error('Erro ao executar motor de regras')
      const report: ApplyReport = await res.json()
      setLastReport(report)
      dispatchToast(
        `Varredura concluída (${report.scanned} lançamentos): ${report.categorized} categorizado(s) · ${
          report.transfers_by_rule + report.transfers_by_heuristic + report.paired_transfers_detected
        } transferência(s) isolada(s).`,
        'success'
      )
      await loadRules()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mony:transactions-updated'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aplicar regras')
    } finally {
      setApplying(false)
    }
  }

  const toggleRule = async (rule: RuleItem) => {
    if (!token) return
    await fetch(`${API_URL}/rules/${rule.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_active: !rule.is_active }),
    })
    await loadRules()
  }

  const executeDeleteRule = async () => {
    if (!token || !deleteTarget) return
    setDeletingRule(true)
    try {
      await fetch(`${API_URL}/rules/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      dispatchToast(`Regra "${deleteTarget.pattern}" removida.`, 'info')
      setDeleteTarget(null)
      await loadRules()
    } finally {
      setDeletingRule(false)
    }
  }

  const categoryOptions =
    categories.length > 0
      ? categories.map((c) => c.name)
      : [
          'Alimentação',
          'Transporte',
          'Moradia',
          'Saúde',
          'Educação',
          'Lazer',
          'Assinaturas',
          'Compras',
          'Investimentos',
          'Salário',
          'Outros',
        ]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <header className="glass-panel flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <SlidersHorizontal className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Regras Automáticas &amp; Anti-Dupla Contagem
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Categorize compras do Open Finance/Mony IA automaticamente e isole transferências internas (Pix entre contas, faturas e aportes).
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleApplyAll}
          disabled={applying}
          className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${applying ? 'animate-spin' : ''}`} />
          {applying ? 'Analisando...' : 'Aplicar Regras & Detectar Transferências'}
        </button>
      </header>

      {error && (
        <div className="glass-card p-3.5 border-rose-400/50 flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Regras Ativas</p>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
            {summary?.active_rules ?? 0}{' '}
            <span className="text-xs font-normal text-slate-500">/ {summary?.total_rules ?? 0}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Rodam no Pluggy e na Mony IA</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Lançamentos Classificados</p>
          <p className="text-2xl font-extrabold text-[var(--accent)] mt-1">
            {summary?.total_matches ?? 0}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Correspondências acumuladas</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Transferências Internas Isoladas</p>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
            {summary?.transfers_excluded ?? 0}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Não inflam receitas nem despesas</p>
        </div>
      </section>

      {lastReport && (
        <section className="glass-card p-4 border-emerald-500/30 bg-emerald-500/5">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2">
            Última Varredura Automática ({lastReport.scanned} transações analisadas)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-xl bg-black/5 dark:bg-white/5 p-2">
              <div className="text-lg font-bold text-slate-900 dark:text-white">{lastReport.categorized}</div>
              <div className="text-[11px] text-slate-500">Categorizadas</div>
            </div>
            <div className="rounded-xl bg-black/5 dark:bg-white/5 p-2">
              <div className="text-lg font-bold text-[var(--accent)]">{lastReport.transfers_by_rule}</div>
              <div className="text-[11px] text-slate-500">Transf. por Regra</div>
            </div>
            <div className="rounded-xl bg-black/5 dark:bg-white/5 p-2">
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{lastReport.transfers_by_heuristic}</div>
              <div className="text-[11px] text-slate-500">Fatura / Corretora</div>
            </div>
            <div className="rounded-xl bg-black/5 dark:bg-white/5 p-2">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{lastReport.paired_transfers_detected}</div>
              <div className="text-[11px] text-slate-500">Pares Entre Contas</div>
            </div>
          </div>
        </section>
      )}

      {/* Create Rule Form */}
      <section className="glass-panel space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Nova Regra Automática</h2>
        </div>

        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Se a descrição ou estabelecimento contiver
            </label>
            <input
              type="text"
              required
              value={form.pattern}
              onChange={(e) => setForm({ ...form, pattern: e.target.value })}
              placeholder="Ex.: IFOOD, UBER, FATURA CARTAO, XP"
              className="w-full px-3 py-2 glass-input rounded-xl text-sm"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Ação
            </label>
            <select
              value={form.action}
              onChange={(e) =>
                setForm({ ...form, action: e.target.value as 'categorize' | 'mark_transfer' })
              }
              className="w-full px-3 py-2 glass-input rounded-xl text-sm"
            >
              <option value="categorize">Atribuir Categoria</option>
              <option value="mark_transfer">Marcar como Transferência Interna</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Categoria Destino
            </label>
            <select
              disabled={form.action === 'mark_transfer'}
              value={form.category_name}
              onChange={(e) => setForm({ ...form, category_name: e.target.value })}
              className="w-full px-3 py-2 glass-input rounded-xl text-sm disabled:opacity-40"
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={saving || !form.pattern.trim()}
              className="w-full liquid-btn liquid-btn-primary py-2.5 px-4 rounded-xl text-xs font-semibold disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Criar Regra'}
            </button>
          </div>
        </form>

        {/* Live Pattern Tester before saving */}
        <div className="pt-2 border-t border-white/25 dark:border-white/10 flex flex-col sm:flex-row sm:items-center gap-2.5 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300 shrink-0">
            <FlaskConical className="w-3.5 h-3.5 text-violet-500" aria-hidden="true" />
            Testar texto:
          </span>
          <input
            type="text"
            value={testSample}
            onChange={(e) => setTestSample(e.target.value)}
            placeholder="Cole um texto de fatura (ex.: PAG*UBER TRIP) para testar..."
            className="input-base text-xs py-1.5 flex-1"
          />
          {testSample.trim() && form.pattern.trim() && (() => {
            const matched = testSample.toLowerCase().includes(form.pattern.trim().toLowerCase())
            return (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold shrink-0 ${
                  matched
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                }`}
              >
                {matched ? '✓ Casou com a regra!' : '✗ Não casa com este padrão'}
              </span>
            )
          })()}
        </div>

        {/* Quick presets */}
        {presets.length > 0 && (
          <div className="pt-2 border-t border-white/20 dark:border-white/10">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
              Atalhos populares (1 clique):
            </p>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => {
                const alreadyExists = rules.some(
                  (r) => r.pattern.toLowerCase() === p.pattern.toLowerCase()
                )
                return (
                  <button
                    key={p.pattern}
                    type="button"
                    disabled={saving || alreadyExists}
                    onClick={() => handleQuickPreset(p)}
                    className="liquid-btn liquid-btn-glass px-3 py-1.5 rounded-full text-xs font-medium disabled:opacity-40"
                  >
                    + {p.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* Rules List */}
      <section className="glass-panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Suas Regras ({rules.length})
          </h2>
          {rules.length > 3 && (
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                value={ruleSearch}
                onChange={(e) => setRuleSearch(e.target.value)}
                placeholder="Filtrar padrão ou categoria..."
                className="input-base pl-8 py-1.5 text-xs"
              />
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 py-4">Carregando regras...</p>
        ) : rules.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500 border border-dashed border-white/25 rounded-2xl">
            Nenhuma regra criada ainda. Use os atalhos acima ou crie sua primeira regra personalizada — a detecção automática de faturas e pares entre contas já está sempre ativa!
          </div>
        ) : (
          <div className="space-y-2">
            {rules
              .filter((r) => {
                const q = ruleSearch.trim().toLowerCase()
                if (!q) return true
                return (
                  r.pattern.toLowerCase().includes(q) ||
                  (r.category_name || '').toLowerCase().includes(q)
                )
              })
              .map((rule) => {
                const catMeta = rule.category_name ? catMetaByName[rule.category_name.toLowerCase()] : undefined
                return (
              <div
                key={rule.id}
                className={`glass-card p-3.5 flex flex-wrap items-center justify-between gap-3 ${
                  !rule.is_active ? 'opacity-55' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      rule.action === 'mark_transfer'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    }`}
                  >
                    {rule.action === 'mark_transfer' ? (
                      <ArrowLeftRight className="w-4 h-4" />
                    ) : (
                      <Tag className="w-4 h-4" />
                    )}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 text-slate-900 dark:text-white">
                        {rule.pattern}
                      </span>
                      <span className="text-xs text-slate-500">→</span>
                      {rule.action === 'mark_transfer' ? (
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          Transferência Interna (isolar do total)
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            backgroundColor: `${catMeta?.color || '#0071E3'}20`,
                            color: catMeta?.color || '#0071E3',
                            border: `1px solid ${catMeta?.color || '#0071E3'}45`,
                          }}
                        >
                          <span aria-hidden="true">{catMeta?.icon || '🏷️'}</span>
                          <span>{rule.category_name || 'Outros'}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {rule.matches_count} lançamento(s) classificado(s) · prioridade #{rule.priority}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleRule(rule)}
                    className="liquid-btn liquid-btn-glass px-2.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1"
                    title={rule.is_active ? 'Pausar regra' : 'Ativar regra'}
                  >
                    <Power className="w-3.5 h-3.5" />
                    {rule.is_active ? 'Ativa' : 'Pausada'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(rule)}
                    className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10"
                    aria-label="Excluir regra"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
                )
              })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Remover regra "${deleteTarget?.pattern || ''}"?`}
        description="Lançamentos já categorizados não serão alterados."
        confirmLabel="Remover"
        variant="danger"
        loading={deletingRule}
        onConfirm={executeDeleteRule}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Pencil, Trash2, Star, Wallet, Tag, X, Link2, ShieldCheck, Sparkles } from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { useAuth } from '@/stores/auth/useAuth'
import { useCategories, type Category } from '@/hooks/useCategories'
import { AISuggestionsBanner } from '@/components/ai/AISuggestionsBanner'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Account {
  id: string
  name: string
  type: 'checking' | 'savings' | 'credit_card' | 'investment' | 'cash'
  balance: number
  currency: string
  icon?: string | null
  color?: string | null
  is_default: boolean
  user_edited?: boolean
  origin_metadata?: Record<string, unknown> | null
}

interface AccountsAudit {
  accounts_total: number
  open_finance_linked_accounts: number
  accounts_synced_with_open_finance: number
  categories_total: number
  outros_expenses_count: number
}

const ACCOUNT_TYPES: ReadonlyArray<{ value: Account['type']; label: string; defaultIcon: string }> = [
  { value: 'checking', label: 'Conta Corrente', defaultIcon: '🏦' },
  { value: 'savings', label: 'Poupança', defaultIcon: '🐷' },
  { value: 'credit_card', label: 'Cartão de Crédito', defaultIcon: '💳' },
  { value: 'investment', label: 'Investimentos', defaultIcon: '📈' },
  { value: 'cash', label: 'Dinheiro', defaultIcon: '💵' },
]

const COLOR_SWATCHES = ['#0071E3', '#059669', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444', '#334155']

export default function AccountsPage() {
  return (
    <PrivateRoute>
      <AccountsContent />
    </PrivateRoute>
  )
}

function AccountsContent() {
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const [activeTab, setActiveTab] = useState<'accounts' | 'categories'>('accounts')

  // Accounts state
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Account form state
  const [name, setName] = useState('')
  const [type, setType] = useState<Account['type']>('checking')
  const [balance, setBalance] = useState('0')
  const [color, setColor] = useState('#0071E3')
  const [icon, setIcon] = useState('🏦')
  const [isDefault, setIsDefault] = useState(false)

  // Categories state
  const {
    categories,
    loading: catLoading,
    createCategory,
    updateCategory,
    deleteCategory,
  } = useCategories(token)
  const [catName, setCatName] = useState('')
  const [catColor, setCatColor] = useState('#059669')
  const [catIcon, setCatIcon] = useState('🏷️')
  const [catError, setCatError] = useState<string | null>(null)
  const [catSaving, setCatSaving] = useState(false)

  // Category Edit modal state
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatColor, setEditCatColor] = useState('#059669')
  const [editCatIcon, setEditCatIcon] = useState('🏷️')
  const [editCatDesc, setEditCatDesc] = useState('')
  const [editCatSaving, setEditCatSaving] = useState(false)

  // Open Finance & AI Audit summary
  const [audit, setAudit] = useState<AccountsAudit | null>(null)

  const fetchAccounts = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [res, auditRes] = await Promise.all([
        fetch(`${API_URL}/accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/accounts/audit`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      if (!res.ok) throw new Error('Falha ao carregar contas')
      const data = await res.json()
      setAccounts(Array.isArray(data) ? data : data.items ?? [])
      if (auditRes.ok) {
        const auditData = await auditRes.json()
        setAudit(auditData)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar contas')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // Escape closes modal
  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen])

  const openCreate = () => {
    setEditing(null)
    setName('')
    setType('checking')
    setBalance('0')
    setColor('#0071E3')
    setIcon('🏦')
    setIsDefault(accounts.length === 0)
    setModalOpen(true)
  }

  const openEdit = (acct: Account) => {
    setEditing(acct)
    setName(acct.name)
    setType(acct.type)
    setBalance(String(acct.balance))
    setColor(acct.color || '#0071E3')
    setIcon(acct.icon || '🏦')
    setIsDefault(acct.is_default)
    setModalOpen(true)
  }

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(),
        type,
        balance: parseFloat(balance) || 0,
        currency: 'BRL',
        color,
        icon,
        is_default: isDefault,
      }
      const url = editing ? `${API_URL}/accounts/${editing.id}` : `${API_URL}/accounts`
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Erro ao salvar conta')
      }
      setModalOpen(false)
      await fetchAccounts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar conta')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccount = async (id: string) => {
    if (!token) return
    setError(null)
    try {
      const res = await fetch(`${API_URL}/accounts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Erro ao excluir conta')
      }
      setDeleteId(null)
      await fetchAccounts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir conta')
    }
  }

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!catName.trim()) return
    setCatSaving(true)
    setCatError(null)
    try {
      await createCategory({
        name: catName.trim(),
        color: catColor,
        icon: catIcon || '🏷️',
        is_default: false,
      })
      setCatName('')
    } catch (err) {
      setCatError(err instanceof Error ? err.message : 'Erro ao criar categoria')
    } finally {
      setCatSaving(false)
    }
  }

  const openEditCategory = (cat: Category) => {
    setEditingCat(cat)
    setEditCatName(cat.name)
    setEditCatColor(cat.color || '#059669')
    setEditCatIcon(cat.icon || '🏷️')
    setEditCatDesc(cat.description || '')
    setCatError(null)
  }

  const handleSaveCategoryEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCat || !editCatName.trim()) return
    setEditCatSaving(true)
    setCatError(null)
    try {
      await updateCategory(editingCat.id, {
        name: editCatName.trim(),
        color: editCatColor,
        icon: editCatIcon || '🏷️',
        description: editCatDesc.trim() || undefined,
      })
      setEditingCat(null)
    } catch (err) {
      setCatError(err instanceof Error ? err.message : 'Erro ao atualizar categoria')
    } finally {
      setEditCatSaving(false)
    }
  }

  const totalBalance = accounts.reduce((acc, a) => acc + Number(a.balance || 0), 0)
  const typeLabel = (t: string) => ACCOUNT_TYPES.find((x) => x.value === t)?.label ?? t

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Contas & Categorias
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Gerencie suas carteiras, saldos consolidados e categorias personalizadas
          </p>
        </div>

        {/* Segmented Control */}
        <div
          className="inline-flex p-1 rounded-xl bg-white/50 dark:bg-white/10 border border-white/60 dark:border-white/15 self-start sm:self-auto"
          role="tablist"
          aria-label="Seções de gestão"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'accounts'}
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'accounts'
                ? 'liquid-nav-active'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Wallet className="w-4 h-4" aria-hidden="true" />
            Contas ({accounts.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'categories'}
            onClick={() => setActiveTab('categories')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'categories'
                ? 'liquid-nav-active'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Tag className="w-4 h-4" aria-hidden="true" />
            Categorias ({categories.length})
          </button>
        </div>
      </div>

      {activeTab === 'accounts' ? (
        <div className="space-y-6">
          {/* Open Finance & Proactive AI Audit Banner */}
          {audit && (
            <div className="glass-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  Auditoria Open Finance
                </span>
                <span className="text-slate-500 dark:text-slate-400">·</span>
                <span>
                  <strong>{audit.open_finance_linked_accounts}</strong> conta(s) Open Finance
                </span>
                <span className="text-slate-500 dark:text-slate-400">·</span>
                <span>
                  <strong>{audit.accounts_synced_with_open_finance}</strong> sincronizada(s) no Mony
                </span>
                {audit.outros_expenses_count > 0 && (
                  <>
                    <span className="text-slate-500 dark:text-slate-400">·</span>
                    <span className="text-amber-700 dark:text-amber-300 font-medium">
                      {audit.outros_expenses_count} gasto(s) em &quot;Outros&quot;
                    </span>
                  </>
                )}
              </div>
              <Link
                href="/settings/connections"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
              >
                <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                Gerenciar Open Finance →
              </Link>
            </div>
          )}

          {token && (
            <AISuggestionsBanner
              module="accounts"
              onApplied={fetchAccounts}
            />
          )}

          {/* Net worth summary */}
          <div className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Patrimônio Consolidado
              </p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1" data-testid="accounts-total-balance">
                R$ {totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="liquid-btn liquid-btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              data-testid="new-account-btn"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Nova Conta
            </button>
          </div>

          {error && (
            <div role="alert" className="p-4 rounded-xl bg-red-50/90 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-36 glass-card animate-pulse" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <div className="glass-panel text-center py-12 space-y-3">
              <Wallet className="w-10 h-10 mx-auto text-slate-400" aria-hidden="true" />
              <p className="text-slate-700 dark:text-slate-200 font-medium">
                Nenhuma conta cadastrada ainda
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Crie sua primeira conta para registrar receitas e despesas.
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-sm font-medium"
              >
                Criar Conta Principal
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accounts.map((acct) => (
                <div key={acct.id} className="glass-card p-5 flex flex-col justify-between gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-sm"
                        style={{ backgroundColor: `${acct.color || '#0071E3'}22`, border: `1px solid ${acct.color || '#0071E3'}44` }}
                        aria-hidden="true"
                      >
                        {acct.icon || '🏦'}
                      </span>
                      <div>
                        <div className="flex items-center flex-wrap gap-1.5">
                          <h2 className="font-semibold text-slate-900 dark:text-white">{acct.name}</h2>
                          {acct.is_default && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100/80 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                              <Star className="w-3 h-3" aria-hidden="true" />
                              Padrão
                            </span>
                          )}
                          {acct.origin_metadata?.provider === 'pluggy' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                              <Link2 className="w-3 h-3" aria-hidden="true" />
                              Open Finance
                            </span>
                          )}
                          {acct.user_edited && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                              Editada
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {typeLabel(acct.type)} · {acct.currency}
                          {typeof acct.origin_metadata?.pluggy_balance === 'number' && (
                            <span className="ml-1.5 text-emerald-700 dark:text-emerald-400">
                              · Banco: R$ {Number(acct.origin_metadata.pluggy_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(acct)}
                        className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/10"
                        aria-label={`Editar conta ${acct.name}`}
                      >
                        <Pencil className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(acct.id)}
                        className="p-2 rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50/60 dark:hover:bg-red-950/30"
                        aria-label={`Excluir conta ${acct.name}`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 dark:border-white/10 flex items-baseline justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Saldo atual</span>
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">
                      R$ {Number(acct.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {deleteId === acct.id && (
                    <div
                      role="alert"
                      className="p-3 rounded-xl bg-red-50/90 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-center justify-between gap-2"
                    >
                      <span className="text-xs text-red-700 dark:text-red-300">
                        Confirmar exclusão desta conta?
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDeleteId(null)}
                          className="px-2.5 py-1 text-xs rounded-lg bg-white/70 dark:bg-white/10 text-slate-700 dark:text-slate-200"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAccount(acct.id)}
                          className="px-2.5 py-1 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700"
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
        </div>
      ) : (
        <div className="space-y-6">
          {token && (
            <AISuggestionsBanner
              module="categories"
              onApplied={fetchAccounts}
            />
          )}

          {/* Create custom category */}
          <form onSubmit={handleCreateCategory} className="glass-panel space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Nova Categoria Personalizada
            </h2>
            {catError && (
              <div role="alert" className="p-3 rounded-xl bg-red-50/90 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
                {catError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label htmlFor="cat-name" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Nome da categoria
                </label>
                <input
                  id="cat-name"
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="Ex: Pets, Assinaturas, Investimentos"
                  className="input-base"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="cat-icon" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Ícone
                </label>
                <input
                  id="cat-icon"
                  type="text"
                  value={catIcon}
                  onChange={(e) => setCatIcon(e.target.value)}
                  maxLength={4}
                  className="input-base text-center"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="cat-color" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Cor
                </label>
                <input
                  id="cat-color"
                  type="color"
                  value={catColor}
                  onChange={(e) => setCatColor(e.target.value)}
                  className="h-10 w-full rounded-xl cursor-pointer border border-slate-300 dark:border-white/20 bg-transparent"
                />
              </div>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={catSaving || !catName.trim()}
                  className="liquid-btn liquid-btn-primary w-full px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  {catSaving ? 'Salvando...' : '+ Adicionar'}
                </button>
              </div>
            </div>
          </form>

          {/* Categories grid */}
          {catLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-20 glass-card animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {categories.map((cat: Category) => (
                <div key={cat.id} className="glass-card p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                      style={{ backgroundColor: `${cat.color}24`, border: `1px solid ${cat.color}55` }}
                      aria-hidden="true"
                    >
                      {cat.icon || '🏷️'}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{cat.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {cat.is_default || cat.is_system ? 'Padrão' : 'Personalizada'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditCategory(cat)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                      aria-label={`Editar categoria ${cat.name}`}
                      title="Personalizar nome, cor e emoji"
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </button>
                    {!cat.is_default && !cat.is_system && (
                      <button
                        type="button"
                        onClick={() => deleteCategory(cat.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        aria-label={`Excluir categoria ${cat.name}`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category Edit Modal */}
      {editingCat && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cat-edit-modal-title"
        >
          <div className="glass-modal max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 id="cat-edit-modal-title" className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" aria-hidden="true" />
                Editar Categoria
              </h2>
              <button
                type="button"
                onClick={() => setEditingCat(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
                aria-label="Fechar modal de categoria"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleSaveCategoryEdit} className="space-y-4">
              <div>
                <label htmlFor="edit-cat-name" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Nome da categoria *
                </label>
                <input
                  id="edit-cat-name"
                  type="text"
                  required
                  value={editCatName}
                  onChange={(e) => setEditCatName(e.target.value)}
                  className="input-base"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-cat-icon" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Ícone
                  </label>
                  <input
                    id="edit-cat-icon"
                    type="text"
                    maxLength={4}
                    value={editCatIcon}
                    onChange={(e) => setEditCatIcon(e.target.value)}
                    className="input-base text-center"
                  />
                </div>
                <div>
                  <label htmlFor="edit-cat-color" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Cor
                  </label>
                  <input
                    id="edit-cat-color"
                    type="color"
                    value={editCatColor}
                    onChange={(e) => setEditCatColor(e.target.value)}
                    className="h-10 w-full rounded-xl cursor-pointer border border-slate-300 dark:border-white/20 bg-transparent"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="edit-cat-desc" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Descrição (opcional)
                </label>
                <input
                  id="edit-cat-desc"
                  type="text"
                  value={editCatDesc}
                  onChange={(e) => setEditCatDesc(e.target.value)}
                  placeholder="Ex: Serviços de assinatura e streaming"
                  className="input-base"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCat(null)}
                  className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editCatSaving}
                  className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  {editCatSaving ? 'Salvando...' : 'Salvar Categoria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Create/Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-modal-title"
        >
          <div className="glass-modal max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 id="account-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
                {editing ? 'Editar Conta' : 'Nova Conta'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-4">
              <div>
                <label htmlFor="acct-name" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Nome da conta *
                </label>
                <input
                  id="acct-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Conta Corrente Nubank"
                  className="input-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="acct-type" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Tipo
                  </label>
                  <select
                    id="acct-type"
                    value={type}
                    onChange={(e) => {
                      const next = e.target.value as Account['type']
                      setType(next)
                      const preset = ACCOUNT_TYPES.find((t) => t.value === next)
                      if (preset && !editing) setIcon(preset.defaultIcon)
                    }}
                    className="input-base"
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="acct-balance" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Saldo inicial (R$)
                  </label>
                  <input
                    id="acct-balance"
                    type="number"
                    step="0.01"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    className="input-base"
                  />
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Cor da conta
                </span>
                <div className="flex flex-wrap gap-2">
                  {COLOR_SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => setColor(swatch)}
                      aria-label={`Selecionar cor ${swatch}`}
                      aria-pressed={color === swatch}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        color === swatch ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white scale-110' : ''
                      }`}
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Definir como conta padrão
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : editing ? 'Atualizar' : 'Criar Conta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import React, { useMemo, useState } from 'react'
import {
  ArrowDownUp,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  Palette,
  SlidersHorizontal,
  Trash2,
  ShieldCheck,
  X,
} from 'lucide-react'
import type { Category } from '@/hooks/useCategories'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface SpreadsheetTx {
  id: string
  account_id: string
  type: 'income' | 'expense' | 'transfer' | 'investment' | 'refund'
  amount: number
  currency?: string
  description: string
  merchant_name?: string | null
  notes?: string | null
  transaction_date: string
  statement_month?: string | null
  payment_method?: string | null
  installment_number?: number | null
  installment_total?: number | null
  category_id?: string | null
  category_name?: string | null
  category_color?: string | null
  category_icon?: string | null
  is_reconciled?: boolean
  source?: string
  external_id?: string | null
  user_edited?: boolean
  origin_metadata?: Record<string, unknown> | null
  tags?: string[]
}

export interface EditableSpreadsheetTableProps {
  token: string
  transactions: SpreadsheetTx[]
  accounts: Array<{ id: string; name: string }>
  categories: Category[]
  loading?: boolean
  emptyLabel?: string
  onRefresh: () => void | Promise<void>
  onUpdateCategory?: (id: string, patch: Partial<Category>) => Promise<void>
  onOpenFullModal?: (tx: SpreadsheetTx) => void
  onDelete?: (id: string) => void
  selectedIds?: Set<string>
  onSelectionChange?: (ids: Set<string>) => void
}

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'alpha_asc' | 'alpha_desc' | 'checked_first' | 'unchecked_first'
type CheckFilter = 'all' | 'checked' | 'unchecked'

const PAYMENT_OPTIONS = [
  { value: 'credit_card', label: 'Cartão' },
  { value: 'debit_card', label: 'Débito' },
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'bank_transfer', label: 'Transf.' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'other', label: 'Outro' },
]

const QUICK_EMOJIS = ['🍔', '🚗', '🏠', '⚕️', '🎮', '📚', '👕', '✈️', '💼', '🛒', '💰', '📈', '💳', '🐾', '🎁', '💡', '📱', '🏋️', '☕', '🏷️']
const QUICK_COLORS = ['#0071E3', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#EA580C', '#6366F1', '#14B8A6']

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

function formatBRDate(dateStr: string): string {
  const clean = (dateStr || '').slice(0, 10)
  if (!clean) return '—'
  const [y, m, d] = clean.split('-')
  return d && m && y ? `${d}/${m}/${y}` : clean
}

function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return QUICK_COLORS[h % QUICK_COLORS.length]
}

export function EditableSpreadsheetTable({
  token,
  transactions,
  accounts,
  categories,
  loading = false,
  emptyLabel = 'Nenhum lançamento encontrado neste mês.',
  onRefresh,
  onUpdateCategory,
  onOpenFullModal,
  onDelete,
  selectedIds,
  onSelectionChange,
}: EditableSpreadsheetTableProps) {
  const [sortBy, setSortBy] = useState<SortKey>('date_desc')
  const [checkFilter, setCheckFilter] = useState<CheckFilter>('all')
  const [searchText, setSearchText] = useState('')
  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<SpreadsheetTx>>>({})

  // Active inline cell editor: `${txId}:${field}`
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState<string>('')
  const [savingId, setSavingId] = useState<string | null>(null)

  // Quick category color & emoji customizer modal
  const [customizingCat, setCustomizingCat] = useState<Category | null>(null)
  const [catEmoji, setCatEmoji] = useState('🏷️')
  const [catColor, setCatColor] = useState('#0071E3')
  const [catNameDraft, setCatNameDraft] = useState('')
  const [savingCat, setSavingCat] = useState(false)

  const acctMap = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts])
  const catByName = useMemo(() => {
    const m: Record<string, Category> = {}
    for (const c of categories) m[c.name.toLowerCase()] = c
    return m
  }, [categories])

  const mergedTransactions = useMemo(
    () =>
      transactions.map((t) => (localOverrides[t.id] ? { ...t, ...localOverrides[t.id] } : t)),
    [transactions, localOverrides]
  )

  const filteredSorted = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    const list = mergedTransactions.filter((t) => {
      if (checkFilter === 'checked' && !t.is_reconciled) return false
      if (checkFilter === 'unchecked' && t.is_reconciled) return false
      if (q) {
        const hay = `${t.description} ${t.merchant_name || ''} ${t.category_name || ''} ${acctMap[t.account_id] || ''} ${(t.tags || []).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    const copy = [...list]
    copy.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc':
          return (b.transaction_date || '').localeCompare(a.transaction_date || '')
        case 'date_asc':
          return (a.transaction_date || '').localeCompare(b.transaction_date || '')
        case 'amount_desc':
          return Number(b.amount) - Number(a.amount)
        case 'amount_asc':
          return Number(a.amount) - Number(b.amount)
        case 'alpha_asc':
          return (a.description || '').localeCompare(b.description || '', 'pt-BR', { sensitivity: 'base' })
        case 'alpha_desc':
          return (b.description || '').localeCompare(a.description || '', 'pt-BR', { sensitivity: 'base' })
        case 'checked_first':
          return Number(Boolean(b.is_reconciled)) - Number(Boolean(a.is_reconciled)) || (b.transaction_date || '').localeCompare(a.transaction_date || '')
        case 'unchecked_first':
          return Number(Boolean(a.is_reconciled)) - Number(Boolean(b.is_reconciled)) || (b.transaction_date || '').localeCompare(a.transaction_date || '')
        default:
          return 0
      }
    })
    return copy
  }, [mergedTransactions, checkFilter, searchText, sortBy, acctMap])

  const incomes = useMemo(() => filteredSorted.filter((t) => t.type === 'income'), [filteredSorted])
  const expenses = useMemo(() => filteredSorted.filter((t) => t.type === 'expense'), [filteredSorted])
  const others = useMemo(
    () => filteredSorted.filter((t) => t.type !== 'income' && t.type !== 'expense'),
    [filteredSorted]
  )

  const totalIncome = useMemo(() => incomes.reduce((s, t) => s + Number(t.amount || 0), 0), [incomes])
  const totalExpense = useMemo(() => expenses.reduce((s, t) => s + Number(t.amount || 0), 0), [expenses])

  const patchTx = async (tx: SpreadsheetTx, patch: Record<string, unknown>, optimistic?: Partial<SpreadsheetTx>) => {
    if (optimistic) {
      setLocalOverrides((prev) => ({ ...prev, [tx.id]: { ...(prev[tx.id] || {}), ...optimistic } }))
    }
    setSavingId(tx.id)
    try {
      const res = await fetch(`${API_URL}/transactions/${tx.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Erro ao salvar alteração')
      }
      setLocalOverrides((prev) => {
        const next = { ...prev }
        delete next[tx.id]
        return next
      })
      window.dispatchEvent(new Event('mony:transactions-updated'))
      await onRefresh()
    } catch (err) {
      setLocalOverrides((prev) => {
        const next = { ...prev }
        delete next[tx.id]
        return next
      })
      dispatchToast(err instanceof Error ? err.message : 'Erro ao salvar célula', 'error')
    } finally {
      setSavingId(null)
    }
  }

  const startInline = (txId: string, field: string, currentValue: string) => {
    setEditingCell(`${txId}:${field}`)
    setDraftValue(currentValue)
  }

  const commitInline = async (tx: SpreadsheetTx, field: string) => {
    const key = `${tx.id}:${field}`
    if (editingCell !== key) return
    setEditingCell(null)
    const val = draftValue.trim()

    if (field === 'description') {
      if (!val || val === tx.description) return
      await patchTx(tx, { description: val }, { description: val, user_edited: true })
    } else if (field === 'amount') {
      const num = parseFloat(val.replace(',', '.'))
      if (!Number.isFinite(num) || num <= 0 || num === Number(tx.amount)) return
      await patchTx(tx, { amount: num }, { amount: num, user_edited: true })
    } else if (field === 'transaction_date') {
      if (!val || val === (tx.transaction_date || '').slice(0, 10)) return
      await patchTx(tx, { transaction_date: val }, { transaction_date: val, user_edited: true })
    } else if (field === 'statement_month') {
      if (!val || val === (tx.statement_month || (tx.transaction_date || '').slice(0, 7))) return
      await patchTx(tx, { statement_month: val }, { statement_month: val, user_edited: true })
    }
  }

  const openCategoryCustomizer = (catName: string) => {
    const found = catByName[catName.toLowerCase()]
    if (!found) {
      dispatchToast('Salve ou crie a categoria em Contas & Categorias para personalizar.', 'info')
      return
    }
    setCustomizingCat(found)
    setCatNameDraft(found.name)
    setCatEmoji(found.icon || '🏷️')
    setCatColor(found.color || '#0071E3')
  }

  const handleSaveCategoryCustom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customizingCat) return
    setSavingCat(true)
    try {
      const patch = { name: catNameDraft.trim() || customizingCat.name, icon: catEmoji || '🏷️', color: catColor }
      if (onUpdateCategory) {
        await onUpdateCategory(customizingCat.id, patch)
      } else {
        const res = await fetch(`${API_URL}/categories/${customizingCat.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (!res.ok) throw new Error('Erro ao personalizar categoria')
      }
      dispatchToast(`Categoria ${patch.icon} ${patch.name} atualizada!`, 'success')
      setCustomizingCat(null)
      await onRefresh()
    } catch (err) {
      dispatchToast(err instanceof Error ? err.message : 'Erro ao salvar categoria', 'error')
    } finally {
      setSavingCat(false)
    }
  }

  const toggleBulkRow = (id: string) => {
    if (!selectedIds || !onSelectionChange) return
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  const renderSectionTable = (
    title: string,
    sectionItems: SpreadsheetTx[],
    accent: 'emerald' | 'rose' | 'sky',
    sectionTotal: number
  ) => {
    const headerColors =
      accent === 'emerald'
        ? 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/25'
        : accent === 'rose'
          ? 'bg-rose-500/12 text-rose-800 dark:text-rose-300 border-rose-500/25'
          : 'bg-sky-500/12 text-sky-800 dark:text-sky-300 border-sky-500/25'

    return (
      <div className="glass-card overflow-hidden">
        <div className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 ${headerColors}`}>
          <div className="flex items-center gap-2 font-bold text-sm">
            {accent === 'emerald' ? (
              <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            ) : (
              <ArrowDownRight className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{title}</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/60 dark:bg-black/25">
              {sectionItems.length}
            </span>
          </div>
          <span className="text-sm font-extrabold tabular-nums money-value">
            Subtotal: {accent === 'emerald' ? '+' : accent === 'rose' ? '-' : ''} {brl(sectionTotal)}
          </span>
        </div>

        {sectionItems.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Nenhum lançamento nesta seção com os filtros atuais.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/45 dark:bg-white/5 border-b border-white/40 dark:border-white/10 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {selectedIds && onSelectionChange && <th className="px-2.5 py-2.5 w-8" aria-label="Seleção em lote" />}
                  <th className="px-2.5 py-2.5 text-center w-10">
                    <button
                      type="button"
                      onClick={() => setSortBy((s) => (s === 'checked_first' ? 'unchecked_first' : 'checked_first'))}
                      title="Ordenar por Pago / Pendente"
                      className="font-bold hover:text-slate-900 dark:hover:text-white"
                    >
                      ✅
                    </button>
                  </th>
                  <th className="px-2.5 py-2.5 text-left">
                    <button
                      type="button"
                      onClick={() => setSortBy((s) => (s === 'date_desc' ? 'date_asc' : 'date_desc'))}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white uppercase"
                    >
                      Data
                    </button>
                  </th>
                  <th className="px-2.5 py-2.5 text-left">
                    <button
                      type="button"
                      onClick={() => setSortBy((s) => (s === 'alpha_asc' ? 'alpha_desc' : 'alpha_asc'))}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white uppercase"
                    >
                      Descrição
                    </button>
                  </th>
                  <th className="px-2.5 py-2.5 text-left">Categoria</th>
                  <th className="px-2.5 py-2.5 text-left">Conta / Pgto</th>
                  <th className="px-2.5 py-2.5 text-center">Mês</th>
                  <th className="px-2.5 py-2.5 text-center">Tipo</th>
                  <th className="px-2.5 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setSortBy((s) => (s === 'amount_desc' ? 'amount_asc' : 'amount_desc'))}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white uppercase"
                    >
                      Valor
                    </button>
                  </th>
                  <th className="px-2.5 py-2.5 text-right w-16">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/25 dark:divide-white/5">
                {sectionItems.map((tx) => {
                  const catName = tx.category_name || 'Outros'
                  const catObj = catByName[catName.toLowerCase()]
                  const catHex = tx.category_color || catObj?.color || hashColor(catName)
                  const catIcon = tx.category_icon || catObj?.icon || '🏷️'
                  const stmtYm = tx.statement_month || (tx.transaction_date || '').slice(0, 7)
                  const isBusy = savingId === tx.id

                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-white/45 dark:hover:bg-white/5 transition-colors ${
                        isBusy ? 'opacity-65' : ''
                      }`}
                    >
                      {selectedIds && onSelectionChange && (
                        <td className="px-2.5 py-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(tx.id)}
                            onChange={() => toggleBulkRow(tx.id)}
                            aria-label={`Selecionar em lote ${tx.description}`}
                          />
                        </td>
                      )}

                      {/* Status Checkbox (Pago / OK) — 1-click toggle! */}
                      <td className="px-2.5 py-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            patchTx(tx, { is_reconciled: !tx.is_reconciled }, { is_reconciled: !tx.is_reconciled })
                          }
                          aria-pressed={tx.is_reconciled}
                          aria-label={tx.is_reconciled ? `Desmarcar ${tx.description}` : `Marcar ${tx.description} como pago`}
                          title={tx.is_reconciled ? 'Marcado (OK) — clique para desmarcar' : 'Não marcado — clique para marcar como OK'}
                          className={`w-6 h-6 rounded-lg border inline-flex items-center justify-center transition ${
                            tx.is_reconciled
                              ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                              : 'border-slate-300 dark:border-white/25 bg-white/50 dark:bg-white/5 hover:border-emerald-400'
                          }`}
                        >
                          {tx.is_reconciled && <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />}
                        </button>
                      </td>

                      {/* Data — click to edit inline */}
                      <td className="px-2.5 py-2 whitespace-nowrap tabular-nums">
                        {editingCell === `${tx.id}:transaction_date` ? (
                          <input
                            type="date"
                            autoFocus
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            onBlur={() => commitInline(tx, 'transaction_date')}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitInline(tx, 'transaction_date')
                              if (e.key === 'Escape') setEditingCell(null)
                            }}
                            className="px-1.5 py-1 rounded-lg border border-blue-400 bg-white dark:bg-slate-900 text-xs"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => startInline(tx.id, 'transaction_date', (tx.transaction_date || '').slice(0, 10))}
                            title="Clique para editar a data"
                            className="px-1.5 py-0.5 rounded hover:bg-blue-500/10 text-slate-700 dark:text-slate-200 transition"
                          >
                            {formatBRDate(tx.transaction_date)}
                          </button>
                        )}
                      </td>

                      {/* Descrição — click text to edit inline */}
                      <td className="px-2.5 py-2 min-w-[200px]">
                        {editingCell === `${tx.id}:description` ? (
                          <input
                            type="text"
                            autoFocus
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            onBlur={() => commitInline(tx, 'description')}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitInline(tx, 'description')
                              if (e.key === 'Escape') setEditingCell(null)
                            }}
                            className="w-full px-2 py-1 rounded-lg border border-blue-400 bg-white dark:bg-slate-900 text-xs font-semibold"
                          />
                        ) : (
                          <div>
                            <button
                              type="button"
                              onClick={() => startInline(tx.id, 'description', tx.description)}
                              title="Clique no texto para editar a descrição"
                              className="text-left font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline decoration-dotted underline-offset-2 transition block max-w-[260px] truncate"
                            >
                              {tx.description}
                            </button>
                            <div className="flex items-center flex-wrap gap-1 mt-0.5 text-[10px] text-slate-500">
                              {tx.source === 'open_finance' && (
                                <span className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-semibold">
                                  <ShieldCheck className="w-3 h-3" /> Open Finance
                                </span>
                              )}
                              {tx.source === 'spreadsheet' && (
                                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Planilha</span>
                              )}
                              {tx.installment_number && tx.installment_total && (
                                <span className="px-1.5 py-0.2 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 font-semibold">
                                  Parc. {tx.installment_number}/{tx.installment_total}
                                </span>
                              )}
                              {tx.user_edited && <span className="text-amber-600 dark:text-amber-400">· Editado</span>}
                              {Array.isArray(tx.tags) &&
                                tx.tags.slice(0, 2).map((tag) => (
                                  <span key={tag} className="px-1.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                                    {tag.startsWith('#') ? tag : `#${tag}`}
                                  </span>
                                ))}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Categoria colorida com emoji — click pill to pick OR customize color & emoji! */}
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        {editingCell === `${tx.id}:category` ? (
                          <div className="flex items-center gap-1">
                            <select
                              autoFocus
                              value={catName}
                              onChange={async (e) => {
                                const nextCat = e.target.value
                                const matched = catByName[nextCat.toLowerCase()]
                                setEditingCell(null)
                                await patchTx(
                                  tx,
                                  { category_name: nextCat },
                                  {
                                    category_name: nextCat,
                                    category_color: matched?.color || hashColor(nextCat),
                                    category_icon: matched?.icon || '🏷️',
                                    user_edited: true,
                                  }
                                )
                              }}
                              onBlur={() => setEditingCell(null)}
                              className="px-2 py-1 rounded-lg border border-blue-400 bg-white dark:bg-slate-900 text-xs max-w-[180px]"
                            >
                              {categories.map((c) => (
                                <option key={c.id} value={c.name}>
                                  {c.icon || '🏷️'} {c.name}
                                </option>
                              ))}
                              {!catObj && <option value={catName}>{catIcon} {catName}</option>}
                            </select>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 group">
                            <button
                              type="button"
                              onClick={() => startInline(tx.id, 'category', catName)}
                              title="Clique para trocar a categoria"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition hover:scale-[1.03]"
                              style={{
                                backgroundColor: `${catHex}22`,
                                color: catHex,
                                border: `1px solid ${catHex}55`,
                              }}
                            >
                              <span aria-hidden="true">{catIcon}</span>
                              <span className="max-w-[160px] truncate">{catName}</span>
                            </button>
                            {catObj && (
                              <button
                                type="button"
                                onClick={() => openCategoryCustomizer(catName)}
                                title={`Personalizar cor e emoji de "${catName}"`}
                                aria-label={`Personalizar cor e emoji de ${catName}`}
                                className="p-1 rounded-lg text-slate-400 opacity-50 group-hover:opacity-100 hover:text-violet-600 transition"
                              >
                                <Palette className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Conta / Cartão + Forma de Pagamento — click either to edit inline */}
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          {editingCell === `${tx.id}:account_id` ? (
                            <select
                              autoFocus
                              value={tx.account_id}
                              onChange={async (e) => {
                                const nextAid = e.target.value
                                setEditingCell(null)
                                if (nextAid === tx.account_id) return
                                await patchTx(tx, { account_id: nextAid }, { account_id: nextAid, user_edited: true })
                              }}
                              onBlur={() => setEditingCell(null)}
                              className="px-1.5 py-0.5 rounded border border-blue-400 bg-white dark:bg-slate-900 text-xs"
                            >
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startInline(tx.id, 'account_id', tx.account_id)}
                              title="Clique para trocar a conta ou cartão"
                              className="text-left font-medium text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline decoration-dotted truncate max-w-[155px]"
                            >
                              {acctMap[tx.account_id] || 'Conta'}
                            </button>
                          )}

                          {editingCell === `${tx.id}:payment_method` ? (
                            <select
                              autoFocus
                              value={tx.payment_method || 'other'}
                              onChange={async (e) => {
                                const nextPm = e.target.value
                                setEditingCell(null)
                                await patchTx(tx, { payment_method: nextPm }, { payment_method: nextPm, user_edited: true })
                              }}
                              onBlur={() => setEditingCell(null)}
                              className="px-1.5 py-0.5 rounded border border-blue-400 bg-white dark:bg-slate-900 text-[11px]"
                            >
                              {PAYMENT_OPTIONS.map((p) => (
                                <option key={p.value} value={p.value}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startInline(tx.id, 'payment_method', tx.payment_method || 'other')}
                              title="Clique para trocar a forma de pagamento"
                              className="text-left text-[10px] text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              {PAYMENT_OPTIONS.find((p) => p.value === tx.payment_method)?.label || tx.payment_method || 'Outro'}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Competência (Mês da Fatura) — click to edit inline */}
                      <td className="px-2.5 py-2 text-center whitespace-nowrap font-mono text-[11px]">
                        {editingCell === `${tx.id}:statement_month` ? (
                          <input
                            type="month"
                            autoFocus
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            onBlur={() => commitInline(tx, 'statement_month')}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitInline(tx, 'statement_month')
                              if (e.key === 'Escape') setEditingCell(null)
                            }}
                            className="px-1.5 py-0.5 rounded border border-blue-400 bg-white dark:bg-slate-900 text-[11px]"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => startInline(tx.id, 'statement_month', stmtYm)}
                            title="Clique para alterar o mês da fatura/competência"
                            className="px-1.5 py-0.5 rounded hover:bg-blue-500/10 text-slate-600 dark:text-slate-300"
                          >
                            {stmtYm}
                          </button>
                        )}
                      </td>

                      {/* Tipo — click to switch Receita/Despesa/Transf. */}
                      <td className="px-2.5 py-2 text-center whitespace-nowrap">
                        {editingCell === `${tx.id}:type` ? (
                          <select
                            autoFocus
                            value={tx.type}
                            onChange={async (e) => {
                              const nextType = e.target.value as SpreadsheetTx['type']
                              setEditingCell(null)
                              if (nextType === tx.type) return
                              await patchTx(tx, { type: nextType }, { type: nextType, user_edited: true })
                            }}
                            onBlur={() => setEditingCell(null)}
                            className="px-1.5 py-0.5 rounded border border-blue-400 bg-white dark:bg-slate-900 text-[11px]"
                          >
                            <option value="expense">Despesa</option>
                            <option value="income">Receita</option>
                            <option value="transfer">Transf.</option>
                            <option value="refund">Estorno</option>
                            <option value="investment">Invest.</option>
                          </select>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startInline(tx.id, 'type', tx.type)}
                            title="Clique para alterar o tipo (Entrada / Saída)"
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition hover:opacity-80 ${
                              tx.type === 'income'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : tx.type === 'expense'
                                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                  : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                            }`}
                          >
                            {tx.type === 'income'
                              ? 'Receita'
                              : tx.type === 'expense'
                                ? 'Despesa'
                                : tx.type === 'transfer'
                                  ? 'Transf.'
                                  : tx.type === 'refund'
                                    ? 'Estorno'
                                    : 'Invest.'}
                          </button>
                        )}
                      </td>

                      {/* Valor — click to edit inline */}
                      <td className="px-2.5 py-2 text-right whitespace-nowrap tabular-nums">
                        {editingCell === `${tx.id}:amount` ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            autoFocus
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            onBlur={() => commitInline(tx, 'amount')}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitInline(tx, 'amount')
                              if (e.key === 'Escape') setEditingCell(null)
                            }}
                            className="w-24 px-2 py-1 rounded-lg border border-blue-400 bg-white dark:bg-slate-900 text-xs font-bold text-right"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => startInline(tx.id, 'amount', String(Number(tx.amount)))}
                            title="Clique no valor para editar"
                            className={`font-bold px-1.5 py-0.5 rounded hover:bg-blue-500/10 transition money-value ${
                              tx.type === 'income'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : tx.type === 'expense'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-sky-600 dark:text-sky-400'
                            }`}
                          >
                            {brl(Number(tx.amount))}
                          </button>
                        )}
                      </td>

                      {/* Discreet Extra Actions (Split/Tags/Origin modal & Delete) */}
                      <td className="px-2.5 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-0.5">
                          {onOpenFullModal && (
                            <button
                              type="button"
                              onClick={() => onOpenFullModal(tx)}
                              title="Mais opções (Tags, Split, Parcelas, Origem)"
                              aria-label={`Mais opções para ${tx.description}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              type="button"
                              onClick={() => onDelete(tx.id)}
                              title="Excluir lançamento"
                              aria-label={`Excluir ${tx.description}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 glass-card animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Sort, Checkbox Filter & Instant Search Toolbar */}
      <div className="glass-card p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <ArrowDownUp className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />
            Ordenar:
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            aria-label="Ordenar lançamentos"
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white/70 dark:bg-white/10 border border-slate-200/80 dark:border-white/15 text-slate-800 dark:text-slate-100"
          >
            <option value="date_desc">Data (Mais recente)</option>
            <option value="date_asc">Data (Mais antiga)</option>
            <option value="amount_desc">Valor (Maior primeiro)</option>
            <option value="amount_asc">Valor (Menor primeiro)</option>
            <option value="alpha_asc">Alfabética (A → Z)</option>
            <option value="alpha_desc">Alfabética (Z → A)</option>
            <option value="checked_first">Checkbox (Marcadas ✅ primeiro)</option>
            <option value="unchecked_first">Checkbox (Não marcadas primeiro)</option>
          </select>

          <div
            className="inline-flex p-0.5 rounded-xl bg-white/55 dark:bg-white/10 border border-slate-200/70 dark:border-white/15 text-xs"
            role="group"
            aria-label="Filtrar por checkbox marcada"
          >
            {(
              [
                ['all', `Todos (${mergedTransactions.length})`],
                ['checked', `✅ Marcados (${mergedTransactions.filter((t) => t.is_reconciled).length})`],
                ['unchecked', `Pendentes (${mergedTransactions.filter((t) => !t.is_reconciled).length})`],
              ] as const
            ).map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                onClick={() => setCheckFilter(val)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  checkFilter === val
                    ? 'liquid-nav-active shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Filtrar descrição, categoria, cartão ou #tag..."
            aria-label="Filtrar lançamentos na planilha"
            className="input-base text-xs py-1.5 w-full lg:w-64"
          />
        </div>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 px-1">
        Dica: <strong>clique diretamente em cima de qualquer texto, valor, data, categoria, conta ou checkbox</strong> para editar na hora — sem precisar abrir modal. Clique no ícone de paleta ao lado da categoria para personalizar cor e emoji.
      </p>

      {mergedTransactions.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Separated Block 1: Entradas / Receitas */}
          {renderSectionTable('Entradas / Receitas', incomes, 'emerald', totalIncome)}

          {/* Separated Block 2: Saídas / Despesas */}
          {renderSectionTable('Saídas / Despesas', expenses, 'rose', totalExpense)}

          {/* Optional Block 3: Transfers / Refunds / Investments (never mixed with Income/Expense) */}
          {others.length > 0 &&
            renderSectionTable(
              'Transferências, Estornos & Investimentos',
              others,
              'sky',
              others.reduce((s, t) => s + Number(t.amount || 0), 0)
            )}

          {/* Consolidated Footer */}
          <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="font-bold text-slate-900 dark:text-white">
              Resumo da Planilha ({filteredSorted.length} lançamento(s))
            </span>
            <div className="flex flex-wrap items-center gap-4 tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold money-value">
                Entradas: +{brl(totalIncome)}
              </span>
              <span className="text-rose-600 dark:text-rose-400 font-bold money-value">
                Saídas: -{brl(totalExpense)}
              </span>
              <span
                className={`font-extrabold money-value ${
                  totalIncome - totalExpense >= 0
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-rose-700 dark:text-rose-300'
                }`}
              >
                Saldo: {brl(totalIncome - totalExpense)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Quick Category Color & Emoji Customizer Modal */}
      {customizingCat && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setCustomizingCat(null)}
        >
          <form
            onSubmit={handleSaveCategoryCustom}
            onClick={(e) => e.stopPropagation()}
            className="glass-modal max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-violet-500" />
                Personalizar Categoria (Cor &amp; Emoji)
              </h3>
              <button type="button" onClick={() => setCustomizingCat(null)} aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex justify-center py-2">
              <span
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold"
                style={{
                  backgroundColor: `${catColor}24`,
                  color: catColor,
                  border: `1.5px solid ${catColor}66`,
                }}
              >
                <span className="text-base">{catEmoji}</span>
                <span>{catNameDraft || customizingCat.name}</span>
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Nome</label>
              <input
                type="text"
                required
                value={catNameDraft}
                onChange={(e) => setCatNameDraft(e.target.value)}
                className="input-base text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Emoji (escolha ou digite qualquer um)</label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  maxLength={4}
                  value={catEmoji}
                  onChange={(e) => setCatEmoji(e.target.value)}
                  className="input-base w-20 text-center text-lg"
                />
                <div className="flex flex-wrap gap-1">
                  {QUICK_EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setCatEmoji(em)}
                      className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition ${
                        catEmoji === em ? 'bg-blue-600/20 ring-1 ring-blue-500' : 'hover:bg-white/60 dark:hover:bg-white/10'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">Cor</label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="color"
                  value={catColor}
                  onChange={(e) => setCatColor(e.target.value)}
                  className="w-10 h-9 rounded-lg cursor-pointer border border-slate-300 dark:border-white/20 bg-transparent"
                />
                {QUICK_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setCatColor(hex)}
                    aria-label={`Cor ${hex}`}
                    className={`w-7 h-7 rounded-full transition-transform ${
                      catColor.toLowerCase() === hex.toLowerCase() ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white scale-110' : ''
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCustomizingCat(null)} className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-xs font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={savingCat} className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-xs font-semibold disabled:opacity-50">
                {savingCat ? 'Salvando...' : 'Salvar Personalização'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownUp,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUp,
  ArrowDown,
  Check,
  CheckCheck,
  Copy,
  Download,
  Palette,
  Plus,
  SlidersHorizontal,
  Trash2,
  ShieldCheck,
  X,
  Sparkles,
  AlertTriangle,
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
  defaultMonth?: string
  exportFilename?: string
  externalCategoryFilter?: string | null
  onClearExternalCategory?: () => void
  onRefresh: () => void | Promise<void>
  onUpdateCategory?: (id: string, patch: Partial<Category>) => Promise<void>
  onOpenFullModal?: (tx: SpreadsheetTx) => void
  onDelete?: (id: string) => void
  selectedIds?: Set<string>
  onSelectionChange?: (ids: Set<string>) => void
}

type SortKey =
  | 'date_desc'
  | 'date_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'alpha_asc'
  | 'alpha_desc'
  | 'checked_first'
  | 'unchecked_first'
type CheckFilter = 'all' | 'checked' | 'unchecked'

const EDITABLE_FIELD_ORDER = [
  'transaction_date',
  'description',
  'category',
  'account_id',
  'payment_method',
  'statement_month',
  'type',
  'amount',
] as const

type EditableField = (typeof EDITABLE_FIELD_ORDER)[number]

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
const SHORT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

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

function getInstallmentTooltip(num: number, total: number, stmtYm: string): string {
  const remaining = Math.max(0, total - num)
  if (remaining === 0) return `Última parcela (${num}/${total}) · quita neste mês!`
  const [y, m] = (stmtYm || '').split('-').map(Number)
  if (!y || !m) return `Faltam ${remaining} parcela(s)`
  const endTotal = y * 12 + (m - 1) + remaining
  const endYear = Math.floor(endTotal / 12)
  const endMonthIdx = endTotal % 12
  return `Faltam ${remaining} parcela${remaining > 1 ? 's' : ''} · termina em ${SHORT_MONTHS[endMonthIdx]}/${endYear}`
}

function getDefaultDateForMonth(ym?: string): string {
  const today = new Date()
  const todayYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  if (!ym || ym === todayYm) {
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  }
  return `${ym}-10`
}

interface ParsedNL {
  description: string
  amount: number
  type: 'income' | 'expense'
  payment_method: string
  category_name: string
}

function parseNaturalQuickEntry(raw: string, categories: Category[]): ParsedNL | null {
  const text = raw.trim()
  if (!text) return null
  // Extract monetary value (e.g. 245,90 | 245.90 | 1.250,50 | R$ 80 | 50)
  const amountRegex = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+(?:[.,]\d{1,2})?)/i
  const m = text.match(amountRegex)
  if (!m) return null
  const numStr = m[1].includes(',') ? m[1].replace(/\./g, '').replace(',', '.') : m[1]
  const amount = parseFloat(numStr)
  if (!Number.isFinite(amount) || amount <= 0) return null

  const lower = text.toLowerCase()
  const isIncome = /\b(sal[aá]rio|freela|freelance|recebi|entrada|dividendo|rendimento|reembolso|b[oô]nus|pagamento recebido)\b/i.test(lower)

  let payment = 'credit_card'
  if (/\b(pix)\b/i.test(lower)) payment = 'pix'
  else if (/\b(d[eé]bito)\b/i.test(lower)) payment = 'debit_card'
  else if (/\b(boleto)\b/i.test(lower)) payment = 'boleto'
  else if (/\b(transf|transfer[eê]ncia|ted|doc)\b/i.test(lower)) payment = 'bank_transfer'
  else if (/\b(dinheiro|esp[eé]cie)\b/i.test(lower)) payment = 'cash'
  else if (/\b(cart[aã]o|cr[eé]dito|visa|master|elo)\b/i.test(lower)) payment = 'credit_card'
  else if (isIncome) payment = 'bank_transfer'

  // Strip value and payment keywords to produce clean description
  const cleanDesc = text
    .replace(amountRegex, ' ')
    .replace(/\b(no|na|em|via|com|por|de|do|da)?\s*(cart[aã]o(\s+de\s+cr[eé]dito)?|cr[eé]dito|d[eé]bito|pix|boleto|transfer[eê]ncia|transf\.?|dinheiro)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleanDesc) return null

  // Infer best matching category from user's real categories
  let categoryName = isIncome
    ? categories.find((c) => /entrada|trabalho|sal[aá]rio|receita/i.test(c.name))?.name || 'Trabalho'
    : 'Outros'

  const catHeuristics: Array<[RegExp, RegExp]> = [
    [/mercado|giassi|angeloni|carrefour|atacad|padaria|ifood|99 food|restaurante|lanche|caf[eé]|pizza|sushi|a[cç]ougue/i, /mercado|alimenta|compras/i],
    [/uber|99pop|posto|gasolina|combust|estacionamento|ped[aá]gio|oficina|mec[aâ]nic/i, /carro|gasolina|transporte/i],
    [/aluguel|condom[ií]nio|celesc|energia|luz|[aá]gua|internet|vero|vivo|claro|tim|imobili[aá]ria/i, /casa|moradia/i],
    [/farm[aá]cia|drogaria|m[eé]dic|dentista|wellhub|academia|exame|hospital|sa[uú]de|unimed/i, /sa[uú]de/i],
    [/netflix|spotify|prime|youtube|apple|cinema|bar|viagem|hotel|cacau|krea|jogo|steam|lazer|divers[aã]o/i, /divers[aã]o|lazer|viagem/i],
    [/curso|faculdade|escola|livro|udemy|alura|educa|brasil paralelo/i, /educa/i],
    [/invest|cdb|tesouro|a[cç][aã]o|fii|binance|xp|nuinvest|econom/i, /econom|invest/i],
  ]

  if (!isIncome) {
    for (const [textRe, catRe] of catHeuristics) {
      if (textRe.test(lower)) {
        const hit = categories.find((c) => catRe.test(c.name))
        if (hit) {
          categoryName = hit.name
          break
        }
      }
    }
    if (categoryName === 'Outros') {
      const directHit = categories.find((c) => lower.includes(c.name.toLowerCase()) && c.name.length >= 3)
      if (directHit) categoryName = directHit.name
    }
  }

  return {
    description: cleanDesc.charAt(0).toUpperCase() + cleanDesc.slice(1),
    amount,
    type: isIncome ? 'income' : 'expense',
    payment_method: payment,
    category_name: categoryName,
  }
}

export function EditableSpreadsheetTable({
  token,
  transactions,
  accounts,
  categories,
  loading = false,
  emptyLabel = 'Nenhum lançamento encontrado neste mês.',
  defaultMonth,
  exportFilename,
  externalCategoryFilter,
  onClearExternalCategory,
  onRefresh,
  onUpdateCategory,
  onOpenFullModal,
  onDelete,
  selectedIds,
  onSelectionChange,
}: EditableSpreadsheetTableProps) {
  const [sortBy, setSortBy] = useState<SortKey>('date_desc')
  const [checkFilter, setCheckFilter] = useState<CheckFilter>('all')
  const [categoryChip, setCategoryChip] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<SpreadsheetTx>>>({})

  // Active inline cell editor: `${txId}:${field}`
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState<string>('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedFlashId, setSavedFlashId] = useState<string | null>(null)
  const [justCheckedId, setJustCheckedId] = useState<string | null>(null)
  const [bulkChecking, setBulkChecking] = useState(false)

  // Quick-add inline row state per section ('income' | 'expense' | null)
  const [quickAddType, setQuickAddType] = useState<'income' | 'expense' | null>(null)
  const [qaDate, setQaDate] = useState(() => getDefaultDateForMonth(defaultMonth))
  const [qaDesc, setQaDesc] = useState('')
  const [qaCategory, setQaCategory] = useState('')
  const [qaAccount, setQaAccount] = useState('')
  const [qaPayment, setQaPayment] = useState('credit_card')
  const [qaAmount, setQaAmount] = useState('')
  const [qaSubmitting, setQaSubmitting] = useState(false)

  // Quick category color & emoji customizer modal
  const [customizingCat, setCustomizingCat] = useState<Category | null>(null)
  const [catEmoji, setCatEmoji] = useState('🏷️')
  const [catColor, setCatColor] = useState('#0071E3')
  const [catNameDraft, setCatNameDraft] = useState('')
  const [savingCat, setSavingCat] = useState(false)

  // Power-User 3.0: Natural language quick-entry bar, duplicate filter & inline new category modal
  const [nlInput, setNlInput] = useState('')
  const [nlSubmitting, setNlSubmitting] = useState(false)
  const [onlyDuplicates, setOnlyDuplicates] = useState(false)
  const [creatingCatForTx, setCreatingCatForTx] = useState<SpreadsheetTx | null>(null)
  const [newCatName, setNewCatName] = useState('')
  const [newCatEmoji, setNewCatEmoji] = useState('🏷️')
  const [newCatColor, setNewCatColor] = useState('#0071E3')
  const [creatingCatBusy, setCreatingCatBusy] = useState(false)

  useEffect(() => {
    setQaDate(getDefaultDateForMonth(defaultMonth))
  }, [defaultMonth])

  useEffect(() => {
    if (externalCategoryFilter !== undefined) {
      setCategoryChip(externalCategoryFilter)
    }
  }, [externalCategoryFilter])

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

  const nlPreview = useMemo(() => parseNaturalQuickEntry(nlInput, categories), [nlInput, categories])

  // Detect probable duplicates (same date + exact cent amount + normalized description)
  const duplicateIds = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const t of mergedTransactions) {
      const key = `${(t.transaction_date || '').slice(0, 10)}|${Math.round((Number(t.amount) || 0) * 100)}|${(t.description || '').trim().toLowerCase().slice(0, 22)}`
      const arr = groups.get(key) || []
      arr.push(t.id)
      groups.set(key, arr)
    }
    const dupSet = new Set<string>()
    for (const ids of groups.values()) {
      if (ids.length > 1) {
        ids.forEach((id) => dupSet.add(id))
      }
    }
    return dupSet
  }, [mergedTransactions])

  // Category chips present in the current dataset (sorted by count desc)
  const presentCategories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of mergedTransactions) {
      const name = t.category_name || 'Outros'
      counts.set(name, (counts.get(name) || 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => {
        const catObj = catByName[name.toLowerCase()]
        return {
          name,
          count,
          color: catObj?.color || hashColor(name),
          icon: catObj?.icon || '🏷️',
        }
      })
  }, [mergedTransactions, catByName])

  // Present #tags in current dataset for 1-click tag chip filtering
  const presentTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of mergedTransactions) {
      if (!Array.isArray(t.tags)) continue
      for (const raw of t.tags) {
        const clean = String(raw).trim()
        if (!clean) continue
        const norm = clean.startsWith('#') ? clean : `#${clean}`
        counts.set(norm, (counts.get(norm) || 0) + 1)
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [mergedTransactions])

  // Reconciliation / paid progress across the month
  const progressStats = useMemo(() => {
    const total = mergedTransactions.length
    const checked = mergedTransactions.filter((t) => t.is_reconciled).length
    const pendingExpenses = mergedTransactions
      .filter((t) => t.type === 'expense' && !t.is_reconciled)
      .reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const pct = total > 0 ? Math.round((checked / total) * 100) : 0
    return { total, checked, pending: total - checked, pendingExpenses, pct }
  }, [mergedTransactions])

  const filteredSorted = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    const list = mergedTransactions.filter((t) => {
      if (onlyDuplicates && !duplicateIds.has(t.id)) return false
      if (checkFilter === 'checked' && !t.is_reconciled) return false
      if (checkFilter === 'unchecked' && t.is_reconciled) return false
      if (categoryChip && (t.category_name || 'Outros').toLowerCase() !== categoryChip.toLowerCase()) {
        return false
      }
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
          return (
            Number(Boolean(b.is_reconciled)) - Number(Boolean(a.is_reconciled)) ||
            (b.transaction_date || '').localeCompare(a.transaction_date || '')
          )
        case 'unchecked_first':
          return (
            Number(Boolean(a.is_reconciled)) - Number(Boolean(b.is_reconciled)) ||
            (b.transaction_date || '').localeCompare(a.transaction_date || '')
          )
        default:
          return 0
      }
    })
    return copy
  }, [mergedTransactions, onlyDuplicates, duplicateIds, checkFilter, categoryChip, searchText, sortBy, acctMap])

  const incomes = useMemo(() => filteredSorted.filter((t) => t.type === 'income'), [filteredSorted])
  const expenses = useMemo(() => filteredSorted.filter((t) => t.type === 'expense'), [filteredSorted])
  const others = useMemo(
    () => filteredSorted.filter((t) => t.type !== 'income' && t.type !== 'expense'),
    [filteredSorted]
  )

  const totalIncome = useMemo(() => incomes.reduce((s, t) => s + Number(t.amount || 0), 0), [incomes])
  const totalExpense = useMemo(() => expenses.reduce((s, t) => s + Number(t.amount || 0), 0), [expenses])

  const flashSaved = (txId: string) => {
    setSavedFlashId(txId)
    window.setTimeout(() => {
      setSavedFlashId((curr) => (curr === txId ? null : curr))
    }, 1700)
  }

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
      flashSaved(tx.id)
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

  const getFieldDraftValue = (tx: SpreadsheetTx, field: EditableField): string => {
    switch (field) {
      case 'transaction_date':
        return (tx.transaction_date || '').slice(0, 10)
      case 'description':
        return tx.description || ''
      case 'category':
        return tx.category_name || 'Outros'
      case 'account_id':
        return tx.account_id
      case 'payment_method':
        return tx.payment_method || 'other'
      case 'statement_month':
        return tx.statement_month || (tx.transaction_date || '').slice(0, 7)
      case 'type':
        return tx.type
      case 'amount':
        return String(Number(tx.amount))
    }
  }

  const startInline = (txId: string, field: EditableField, currentValue: string) => {
    setEditingCell(`${txId}:${field}`)
    setDraftValue(currentValue)
  }

  const moveFocusTab = (tx: SpreadsheetTx, currentField: EditableField, backwards: boolean) => {
    const idx = EDITABLE_FIELD_ORDER.indexOf(currentField)
    const nextIdx = backwards ? idx - 1 : idx + 1
    if (nextIdx >= 0 && nextIdx < EDITABLE_FIELD_ORDER.length) {
      const nextField = EDITABLE_FIELD_ORDER[nextIdx]
      startInline(tx.id, nextField, getFieldDraftValue(tx, nextField))
    } else {
      setEditingCell(null)
    }
  }

  const commitInline = async (tx: SpreadsheetTx, field: EditableField, moveTab?: 'next' | 'prev') => {
    const key = `${tx.id}:${field}`
    if (editingCell !== key) return
    const val = draftValue.trim()

    if (moveTab) {
      moveFocusTab(tx, field, moveTab === 'prev')
    } else {
      setEditingCell(null)
    }

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

  const handleDuplicate = async (tx: SpreadsheetTx) => {
    if (!token) return
    setSavingId(tx.id)
    try {
      const res = await fetch(`${API_URL}/transactions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_id: tx.account_id,
          type: tx.type,
          amount: Number(tx.amount) || 0.01,
          currency: tx.currency || 'BRL',
          description: tx.description,
          merchant_name: tx.merchant_name || tx.description,
          notes: tx.notes || undefined,
          transaction_date: (tx.transaction_date || '').slice(0, 10),
          statement_month: tx.statement_month || (tx.transaction_date || '').slice(0, 7),
          payment_method: tx.payment_method || 'other',
          category_name: tx.category_name || 'Outros',
          is_reconciled: false,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao duplicar lançamento')
      }
      dispatchToast(`"${tx.description}" duplicado!`, 'success')
      window.dispatchEvent(new Event('mony:transactions-updated'))
      await onRefresh()
    } catch (err) {
      dispatchToast(err instanceof Error ? err.message : 'Erro ao duplicar', 'error')
    } finally {
      setSavingId(null)
    }
  }

  const openQuickAdd = (type: 'income' | 'expense') => {
    setQuickAddType(type)
    setQaDate(getDefaultDateForMonth(defaultMonth))
    setQaDesc('')
    setQaAmount('')
    setQaAccount(accounts[0]?.id || '')
    setQaPayment(type === 'income' ? 'bank_transfer' : 'credit_card')
    const defaultCat =
      type === 'income'
        ? categories.find((c) => /entrada|trabalho|sal[aá]rio|receita/i.test(c.name))?.name || categories[0]?.name || 'Trabalho'
        : categories.find((c) => /mercado|alimenta|casa|outros/i.test(c.name))?.name || categories[0]?.name || 'Outros'
    setQaCategory(defaultCat)
  }

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !quickAddType) return
    const desc = qaDesc.trim()
    const amount = parseFloat(qaAmount.replace(',', '.'))
    const accountId = qaAccount || accounts[0]?.id
    if (!desc) {
      dispatchToast('Digite uma descrição para o lançamento.', 'error')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      dispatchToast('Informe um valor válido maior que zero.', 'error')
      return
    }
    if (!accountId) {
      dispatchToast('Crie uma conta em Contas & Categorias antes de lançar.', 'error')
      return
    }
    setQaSubmitting(true)
    try {
      const stmtYm = defaultMonth || qaDate.slice(0, 7)
      const res = await fetch(`${API_URL}/transactions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_id: accountId,
          type: quickAddType,
          amount,
          currency: 'BRL',
          description: desc,
          merchant_name: desc,
          transaction_date: qaDate,
          statement_month: stmtYm,
          payment_method: qaPayment,
          category_name: qaCategory || 'Outros',
          is_reconciled: false,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao adicionar lançamento')
      }
      dispatchToast(`${quickAddType === 'income' ? 'Entrada' : 'Saída'} "${desc}" adicionada!`, 'success')
      setQaDesc('')
      setQaAmount('')
      window.dispatchEvent(new Event('mony:transactions-updated'))
      await onRefresh()
    } catch (err) {
      dispatchToast(err instanceof Error ? err.message : 'Erro ao adicionar', 'error')
    } finally {
      setQaSubmitting(false)
    }
  }

  const handleMarkVisibleReconciled = async (targetState: boolean) => {
    const targets = filteredSorted.filter((t) => Boolean(t.is_reconciled) !== targetState)
    if (targets.length === 0 || !token) return
    setBulkChecking(true)
    try {
      await Promise.all(
        targets.map((tx) =>
          fetch(`${API_URL}/transactions/${tx.id}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ is_reconciled: targetState }),
          })
        )
      )
      dispatchToast(
        `${targets.length} lançamento(s) ${targetState ? 'marcados como pagos ✅' : 'desmarcados'}.`,
        'success'
      )
      window.dispatchEvent(new Event('mony:transactions-updated'))
      await onRefresh()
    } catch {
      dispatchToast('Não foi possível atualizar todos os lançamentos.', 'error')
    } finally {
      setBulkChecking(false)
    }
  }

  const handleExportVisibleCSV = () => {
    if (filteredSorted.length === 0) return
    const headers = ['Status', 'Data', 'Competência', 'Tipo', 'Descrição', 'Categoria', 'Conta / Cartão', 'Forma Pgto', 'Valor (R$)']
    const rows = filteredSorted.map((t) => [
      t.is_reconciled ? 'Pago' : 'Pendente',
      formatBRDate(t.transaction_date),
      t.statement_month || (t.transaction_date || '').slice(0, 7),
      t.type === 'income' ? 'Receita' : t.type === 'expense' ? 'Despesa' : t.type,
      t.description,
      t.category_name || 'Outros',
      acctMap[t.account_id] || 'Conta',
      PAYMENT_OPTIONS.find((p) => p.value === t.payment_method)?.label || t.payment_method || 'Outro',
      (Number(t.amount) || 0).toFixed(2).replace('.', ','),
    ])
    const csv =
      '\uFEFF' +
      [headers, ...rows]
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
        .join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = exportFilename || `mony-planilha-${defaultMonth || new Date().toISOString().slice(0, 7)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    dispatchToast(`Planilha exportada (${filteredSorted.length} lançamentos)!`, 'success')
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

  const toggleBulkSection = (items: SpreadsheetTx[]) => {
    if (!selectedIds || !onSelectionChange || items.length === 0) return
    const allSelected = items.every((t) => selectedIds.has(t.id))
    const next = new Set(selectedIds)
    if (allSelected) {
      items.forEach((t) => next.delete(t.id))
    } else {
      items.forEach((t) => next.add(t.id))
    }
    onSelectionChange(next)
  }

  const handleNaturalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !nlPreview) return
    const accountId = accounts[0]?.id
    if (!accountId) {
      dispatchToast('Cadastre uma conta antes de lançar.', 'error')
      return
    }
    setNlSubmitting(true)
    try {
      const txDate = getDefaultDateForMonth(defaultMonth)
      const stmtYm = defaultMonth || txDate.slice(0, 7)
      const res = await fetch(`${API_URL}/transactions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_id: accountId,
          type: nlPreview.type,
          amount: nlPreview.amount,
          currency: 'BRL',
          description: nlPreview.description,
          merchant_name: nlPreview.description,
          transaction_date: txDate,
          statement_month: stmtYm,
          payment_method: nlPreview.payment_method,
          category_name: nlPreview.category_name,
          is_reconciled: false,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao lançar')
      }
      dispatchToast(
        `${nlPreview.type === 'income' ? 'Entrada' : 'Saída'} "${nlPreview.description}" (${brl(nlPreview.amount)}) lançada!`,
        'success'
      )
      setNlInput('')
      window.dispatchEvent(new Event('mony:transactions-updated'))
      await onRefresh()
    } catch (err) {
      dispatchToast(err instanceof Error ? err.message : 'Erro ao lançar', 'error')
    } finally {
      setNlSubmitting(false)
    }
  }

  const handleCreateCategoryInline = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newCatName.trim()
    if (!trimmed || !token) return
    setCreatingCatBusy(true)
    try {
      const res = await fetch(`${API_URL}/categories`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmed,
          icon: newCatEmoji || '🏷️',
          color: newCatColor,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao criar categoria')
      }
      const targetTx = creatingCatForTx
      setCreatingCatForTx(null)
      setNewCatName('')
      if (targetTx) {
        await patchTx(
          targetTx,
          { category_name: trimmed },
          {
            category_name: trimmed,
            category_color: newCatColor,
            category_icon: newCatEmoji || '🏷️',
            user_edited: true,
          }
        )
      } else {
        await onRefresh()
      }
      dispatchToast(`Categoria ${newCatEmoji} ${trimmed} criada e aplicada!`, 'success')
    } catch (err) {
      dispatchToast(err instanceof Error ? err.message : 'Erro ao criar categoria', 'error')
    } finally {
      setCreatingCatBusy(false)
    }
  }

  const renderSortArrow = (ascKey: SortKey, descKey: SortKey) => {
    if (sortBy === ascKey) return <ArrowUp className="w-3 h-3 text-blue-500" aria-hidden="true" />
    if (sortBy === descKey) return <ArrowDown className="w-3 h-3 text-blue-500" aria-hidden="true" />
    return null
  }

  const renderSectionTable = (
    title: string,
    sectionItems: SpreadsheetTx[],
    accent: 'emerald' | 'rose' | 'sky',
    sectionTotal: number,
    quickAddKind?: 'income' | 'expense'
  ) => {
    const headerColors =
      accent === 'emerald'
        ? 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/25'
        : accent === 'rose'
          ? 'bg-rose-500/12 text-rose-800 dark:text-rose-300 border-rose-500/25'
          : 'bg-sky-500/12 text-sky-800 dark:text-sky-300 border-sky-500/25'

    const isQuickAddingHere = quickAddKind && quickAddType === quickAddKind

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
          <div className="flex items-center gap-3">
            {quickAddKind && accounts.length > 0 && (
              <button
                type="button"
                onClick={() => (isQuickAddingHere ? setQuickAddType(null) : openQuickAdd(quickAddKind))}
                className="no-print inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/70 dark:bg-black/25 hover:bg-white dark:hover:bg-black/40 transition"
              >
                <Plus className="w-3 h-3" aria-hidden="true" />
                {isQuickAddingHere ? 'Fechar linha' : `Adicionar ${quickAddKind === 'income' ? 'entrada' : 'saída'}`}
              </button>
            )}
            <span className="text-sm font-extrabold tabular-nums money-value">
              Subtotal: {accent === 'emerald' ? '+' : accent === 'rose' ? '-' : ''} {brl(sectionTotal)}
            </span>
          </div>
        </div>

        {sectionItems.length === 0 && !isQuickAddingHere ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Nenhum lançamento nesta seção com os filtros atuais.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[72vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 backdrop-blur-md bg-white/85 dark:bg-slate-900/90 shadow-sm">
                <tr className="border-b border-white/50 dark:border-white/10 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {selectedIds && onSelectionChange && (
                    <th className="px-2.5 py-2.5 w-8 no-print" aria-label="Selecionar todos desta seção">
                      <input
                        type="checkbox"
                        checked={sectionItems.length > 0 && sectionItems.every((t) => selectedIds.has(t.id))}
                        onChange={() => toggleBulkSection(sectionItems)}
                        title="Selecionar todos desta seção"
                        aria-label={`Selecionar todos em ${title}`}
                      />
                    </th>
                  )}
                  <th className="px-2.5 py-2.5 text-center w-10">
                    <button
                      type="button"
                      onClick={() => setSortBy((s) => (s === 'checked_first' ? 'unchecked_first' : 'checked_first'))}
                      title="Ordenar por Pago / Pendente"
                      className="inline-flex items-center gap-0.5 font-bold hover:text-slate-900 dark:hover:text-white"
                    >
                      ✅
                      {renderSortArrow('unchecked_first', 'checked_first')}
                    </button>
                  </th>
                  <th className="px-2.5 py-2.5 text-left">
                    <button
                      type="button"
                      onClick={() => setSortBy((s) => (s === 'date_desc' ? 'date_asc' : 'date_desc'))}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white uppercase"
                    >
                      Data
                      {renderSortArrow('date_asc', 'date_desc')}
                    </button>
                  </th>
                  <th className="px-2.5 py-2.5 text-left">
                    <button
                      type="button"
                      onClick={() => setSortBy((s) => (s === 'alpha_asc' ? 'alpha_desc' : 'alpha_asc'))}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white uppercase"
                    >
                      Descrição
                      {renderSortArrow('alpha_asc', 'alpha_desc')}
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
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white uppercase ml-auto"
                    >
                      Valor
                      {renderSortArrow('amount_asc', 'amount_desc')}
                    </button>
                  </th>
                  <th className="px-2.5 py-2.5 text-right w-20 no-print">Ações</th>
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
                  const showSaved = savedFlashId === tx.id

                  return (
                    <tr
                      key={tx.id}
                      className={`hover:bg-white/45 dark:hover:bg-white/5 transition-colors ${
                        isBusy ? 'opacity-65' : ''
                      } ${showSaved ? 'bg-emerald-500/8' : ''}`}
                    >
                      {selectedIds && onSelectionChange && (
                        <td className="px-2.5 py-2 no-print">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(tx.id)}
                            onChange={() => toggleBulkRow(tx.id)}
                            aria-label={`Selecionar em lote ${tx.description}`}
                          />
                        </td>
                      )}

                      {/* Status Checkbox (Pago / OK) — 1-click toggle with tactile pop! */}
                      <td className="px-2.5 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const nextVal = !tx.is_reconciled
                            if (nextVal) {
                              setJustCheckedId(tx.id)
                              window.setTimeout(() => setJustCheckedId((c) => (c === tx.id ? null : c)), 350)
                            }
                            patchTx(tx, { is_reconciled: nextVal }, { is_reconciled: nextVal })
                          }}
                          aria-pressed={Boolean(tx.is_reconciled)}
                          aria-label={tx.is_reconciled ? `Desmarcar ${tx.description}` : `Marcar ${tx.description} como pago`}
                          title={tx.is_reconciled ? 'Marcado (OK) — clique para desmarcar' : 'Não marcado — clique para marcar como OK'}
                          className={`w-6 h-6 rounded-lg border inline-flex items-center justify-center transition ${
                            justCheckedId === tx.id ? 'mony-check-pop' : ''
                          } ${
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
                              if (e.key === 'Tab') {
                                e.preventDefault()
                                commitInline(tx, 'transaction_date', e.shiftKey ? 'prev' : 'next')
                              }
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
                              if (e.key === 'Tab') {
                                e.preventDefault()
                                commitInline(tx, 'description', e.shiftKey ? 'prev' : 'next')
                              }
                            }}
                            className="w-full px-2 py-1 rounded-lg border border-blue-400 bg-white dark:bg-slate-900 text-xs font-semibold"
                          />
                        ) : (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => startInline(tx.id, 'description', tx.description)}
                                title="Clique no texto para editar a descrição"
                                className="text-left font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline decoration-dotted underline-offset-2 transition block max-w-[240px] truncate"
                              >
                                {tx.description}
                              </button>
                              {showSaved && (
                                <span className="mony-saved-flash inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                                  Salvo ✓
                                </span>
                              )}
                            </div>
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
                                <span
                                  title={getInstallmentTooltip(tx.installment_number, tx.installment_total, stmtYm)}
                                  className="px-1.5 py-0.2 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 font-semibold cursor-help"
                                >
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
                                setEditingCell(null)
                                if (nextCat === '__new_cat__') {
                                  setCreatingCatForTx(tx)
                                  setNewCatName('')
                                  setNewCatEmoji('🏷️')
                                  setNewCatColor('#0071E3')
                                  return
                                }
                                const matched = catByName[nextCat.toLowerCase()]
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
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') setEditingCell(null)
                                if (e.key === 'Tab') {
                                  e.preventDefault()
                                  moveFocusTab(tx, 'category', e.shiftKey)
                                }
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
                              <option value="__new_cat__">＋ Criar nova categoria...</option>
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
                                className="no-print p-1 rounded-lg text-slate-400 opacity-50 group-hover:opacity-100 hover:text-violet-600 transition"
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
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') setEditingCell(null)
                                if (e.key === 'Tab') {
                                  e.preventDefault()
                                  moveFocusTab(tx, 'account_id', e.shiftKey)
                                }
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
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') setEditingCell(null)
                                if (e.key === 'Tab') {
                                  e.preventDefault()
                                  moveFocusTab(tx, 'payment_method', e.shiftKey)
                                }
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
                              if (e.key === 'Tab') {
                                e.preventDefault()
                                commitInline(tx, 'statement_month', e.shiftKey ? 'prev' : 'next')
                              }
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
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setEditingCell(null)
                              if (e.key === 'Tab') {
                                e.preventDefault()
                                moveFocusTab(tx, 'type', e.shiftKey)
                              }
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
                              if (e.key === 'Tab') {
                                e.preventDefault()
                                commitInline(tx, 'amount', e.shiftKey ? 'prev' : 'next')
                              }
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

                      {/* Discreet Extra Actions (Duplicate, Split/Tags/Origin modal & Delete) */}
                      <td className="px-2.5 py-2 text-right whitespace-nowrap no-print">
                        <div className="inline-flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleDuplicate(tx)}
                            title="Duplicar lançamento (1 clique)"
                            aria-label={`Duplicar ${tx.description}`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {onOpenFullModal && (
                            <button
                              type="button"
                              onClick={() => onOpenFullModal(tx)}
                              title="Mais opções (Tags, Split, Parcelas, Origem)"
                              aria-label={`Mais opções para ${tx.description}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
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
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition"
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

        {/* Quick-add inline form directly in section footer (Excel/Notion style) */}
        {isQuickAddingHere && (
          <form
            onSubmit={handleQuickAddSubmit}
            className="no-print px-4 py-3 border-t border-white/40 dark:border-white/10 bg-white/55 dark:bg-white/5 grid grid-cols-2 md:grid-cols-12 gap-2 items-center"
          >
            <input
              type="date"
              value={qaDate}
              onChange={(e) => setQaDate(e.target.value)}
              aria-label="Data do novo lançamento"
              className="md:col-span-2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-900 text-xs"
              required
            />
            <input
              type="text"
              autoFocus
              value={qaDesc}
              onChange={(e) => setQaDesc(e.target.value)}
              placeholder={quickAddKind === 'income' ? 'Ex.: Freelance, Salário...' : 'Ex.: Mercado, Posto, Farmácia...'}
              aria-label="Descrição do novo lançamento"
              className="col-span-2 md:col-span-3 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-900 text-xs font-medium"
              required
            />
            <select
              value={qaCategory}
              onChange={(e) => setQaCategory(e.target.value)}
              aria-label="Categoria do novo lançamento"
              className="md:col-span-2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-900 text-xs"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.icon || '🏷️'} {c.name}
                </option>
              ))}
            </select>
            <select
              value={qaAccount}
              onChange={(e) => setQaAccount(e.target.value)}
              aria-label="Conta do novo lançamento"
              className="md:col-span-2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-900 text-xs"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={qaAmount}
              onChange={(e) => setQaAmount(e.target.value)}
              placeholder="0,00"
              aria-label="Valor do novo lançamento"
              className="md:col-span-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-900 text-xs font-bold text-right"
              required
            />
            <div className="col-span-2 md:col-span-2 flex items-center justify-end gap-1.5">
              <button
                type="submit"
                disabled={qaSubmitting}
                className="liquid-btn liquid-btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {qaSubmitting ? 'Salvando...' : 'Adicionar'}
              </button>
              <button
                type="button"
                onClick={() => setQuickAddType(null)}
                aria-label="Cancelar adição rápida"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
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
      {/* Power-User 3.0: Natural Language Quick-Entry Bar */}
      {accounts.length > 0 && (
        <form
          onSubmit={handleNaturalSubmit}
          className="glass-card p-3 space-y-2 border border-blue-400/25 no-print"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1">
              <Sparkles className="w-4 h-4 text-blue-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                value={nlInput}
                onChange={(e) => setNlInput(e.target.value)}
                placeholder='Lançamento rápido: digite ex. "Giassi 245,90 cartão" ou "Freela 1500 pix" e aperte Enter'
                aria-label="Lançamento rápido em texto livre"
                className="input-base pl-9 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={!nlPreview || nlSubmitting}
              className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold shrink-0 disabled:opacity-40"
            >
              {nlSubmitting ? 'Lançando...' : 'Lançar agora'}
            </button>
          </div>
          {nlPreview && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] pl-1">
              <span className="text-slate-500 dark:text-slate-400">Prévia:</span>
              <span
                className={`px-2 py-0.5 rounded-full font-bold ${
                  nlPreview.type === 'income'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                }`}
              >
                {nlPreview.type === 'income' ? '+ Entrada' : '- Saída'} {brl(nlPreview.amount)}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/65 dark:bg-white/10 font-semibold text-slate-800 dark:text-slate-100">
                {nlPreview.description}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold">
                {catByName[nlPreview.category_name.toLowerCase()]?.icon || '🏷️'} {nlPreview.category_name}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                {PAYMENT_OPTIONS.find((p) => p.value === nlPreview.payment_method)?.label || nlPreview.payment_method}
              </span>
            </div>
          )}
        </form>
      )}

      {/* Probable Duplicates Alert Pill */}
      {duplicateIds.size > 0 && (
        <div className="glass-card px-4 py-2.5 border-amber-400/50 bg-amber-500/10 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200 no-print">
          <span className="inline-flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
            Detectamos <strong>{duplicateIds.size}</strong> lançamento(s) com mesma data, valor e descrição parecida neste mês.
          </span>
          <button
            type="button"
            onClick={() => setOnlyDuplicates((v) => !v)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              onlyDuplicates
                ? 'bg-amber-600 text-white'
                : 'bg-white/75 dark:bg-white/10 text-amber-800 dark:text-amber-200 hover:bg-white'
            }`}
          >
            {onlyDuplicates ? 'Mostrar todos os lançamentos' : 'Revisar possíveis duplicatas'}
          </button>
        </div>
      )}

      {/* Sort, Checkbox Filter, Progress & Export Toolbar */}
      <div className="glass-card p-3.5 space-y-3 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
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
                  ['checked', `✅ Marcados (${progressStats.checked})`],
                  ['unchecked', `Pendentes (${progressStats.pending})`],
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

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Filtrar descrição, categoria, cartão ou #tag..."
              aria-label="Filtrar lançamentos na planilha"
              className="input-base text-xs py-1.5 flex-1 min-w-[190px] lg:w-60"
            />
            {filteredSorted.some((t) => !t.is_reconciled) && (
              <button
                type="button"
                disabled={bulkChecking}
                onClick={() => handleMarkVisibleReconciled(true)}
                title="Marcar todos os lançamentos visíveis como pagos (OK)"
                className="liquid-btn liquid-btn-glass inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300 disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Marcar visíveis</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportVisibleCSV}
              disabled={filteredSorted.length === 0}
              title="Exportar lançamentos exibidos para Excel / CSV"
              className="liquid-btn liquid-btn-glass inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>

        {/* Reconciliation Progress Bar */}
        {progressStats.total > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-white/40 dark:border-white/10 text-[11px]">
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                ✅ {progressStats.checked}/{progressStats.total} conferidos ({progressStats.pct}%)
              </span>
              {progressStats.pendingExpenses > 0 && (
                <span className="text-rose-600 dark:text-rose-400 font-semibold money-value">
                  · Faltam pagar: {brl(progressStats.pendingExpenses)}
                </span>
              )}
            </div>
            <div className="flex-1 h-1.5 rounded-full bg-slate-200/75 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 ease-out"
                style={{ width: `${progressStats.pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Clickable Colored Category Quick-Filter Chips */}
        {presentCategories.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1" role="group" aria-label="Filtrar por categoria">
            <button
              type="button"
              onClick={() => {
                setCategoryChip(null)
                onClearExternalCategory?.()
              }}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition border ${
                !categoryChip
                  ? 'liquid-nav-active border-transparent'
                  : 'bg-white/45 dark:bg-white/5 border-white/60 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-white/75'
              }`}
            >
              Todas ({mergedTransactions.length})
            </button>
            {presentCategories.map((cat) => {
              const active = categoryChip?.toLowerCase() === cat.name.toLowerCase()
              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => {
                    if (active) {
                      setCategoryChip(null)
                      onClearExternalCategory?.()
                    } else {
                      setCategoryChip(cat.name)
                    }
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition ${
                    active ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-white scale-[1.03]' : 'opacity-85 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: active ? `${cat.color}36` : `${cat.color}1C`,
                    color: cat.color,
                    border: `1px solid ${cat.color}55`,
                  }}
                >
                  <span aria-hidden="true">{cat.icon}</span>
                  <span className="max-w-[130px] truncate">{cat.name}</span>
                  <span className="opacity-75">({cat.count})</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Clickable #Tag Quick-Filter Chips (EPIC-009) */}
        {presentTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1" role="group" aria-label="Filtrar por tag">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Tags:</span>
            {presentTags.map(([tag, count]) => {
              const active = searchText.trim().toLowerCase() === tag.toLowerCase()
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSearchText(active ? '' : tag)}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition border ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-indigo-500/25 hover:bg-indigo-500/20'
                  }`}
                >
                  {tag} ({count})
                </button>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 px-1 no-print">
        Dica: <strong>clique direto em qualquer célula</strong> para editar · use <kbd className="px-1 py-0.5 rounded bg-white/60 dark:bg-white/10 font-mono text-[10px]">Tab</kbd> para avançar, <kbd className="px-1 py-0.5 rounded bg-white/60 dark:bg-white/10 font-mono text-[10px]">Enter</kbd> para salvar e <kbd className="px-1 py-0.5 rounded bg-white/60 dark:bg-white/10 font-mono text-[10px]">Esc</kbd> para cancelar.
      </p>

      {mergedTransactions.length === 0 && !quickAddType ? (
        <div className="glass-card p-10 text-center space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">{emptyLabel}</p>
          {accounts.length > 0 && (
            <div className="flex items-center justify-center gap-2 no-print">
              <button
                type="button"
                onClick={() => openQuickAdd('income')}
                className="liquid-btn liquid-btn-glass px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Nova Entrada
              </button>
              <button
                type="button"
                onClick={() => openQuickAdd('expense')}
                className="liquid-btn liquid-btn-glass px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Nova Saída
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Separated Block 1: Entradas / Receitas */}
          {renderSectionTable('Entradas / Receitas', incomes, 'emerald', totalIncome, 'income')}

          {/* Separated Block 2: Saídas / Despesas */}
          {renderSectionTable('Saídas / Despesas', expenses, 'rose', totalExpense, 'expense')}

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
          className="fixed inset-0 z-[70] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 no-print"
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
      {/* Inline New Category Creator Modal (opened directly from cell select) */}
      {creatingCatForTx && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 no-print"
          role="dialog"
          aria-modal="true"
          onClick={() => setCreatingCatForTx(null)}
        >
          <form
            onSubmit={handleCreateCategoryInline}
            onClick={(e) => e.stopPropagation()}
            className="glass-modal max-w-sm w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-500" />
                Nova Categoria Rápida
              </h3>
              <button type="button" onClick={() => setCreatingCatForTx(null)} aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex justify-center py-1">
              <span
                className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-bold"
                style={{
                  backgroundColor: `${newCatColor}24`,
                  color: newCatColor,
                  border: `1.5px solid ${newCatColor}66`,
                }}
              >
                <span>{newCatEmoji}</span>
                <span>{newCatName.trim() || 'Nova categoria'}</span>
              </span>
            </div>

            <input
              type="text"
              required
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Ex.: Pets, Streaming, Presentes..."
              className="input-base text-sm"
            />

            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={4}
                value={newCatEmoji}
                onChange={(e) => setNewCatEmoji(e.target.value)}
                aria-label="Emoji"
                className="input-base w-16 text-center text-base"
              />
              <input
                type="color"
                value={newCatColor}
                onChange={(e) => setNewCatColor(e.target.value)}
                aria-label="Cor"
                className="w-10 h-9 rounded-lg cursor-pointer border border-slate-300 dark:border-white/20 bg-transparent"
              />
              <div className="flex flex-wrap gap-1">
                {QUICK_COLORS.slice(0, 6).map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setNewCatColor(hex)}
                    className="w-5 h-5 rounded-full"
                    style={{ backgroundColor: hex }}
                    aria-label={`Cor ${hex}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setCreatingCatForTx(null)} className="liquid-btn liquid-btn-glass px-3.5 py-2 rounded-xl text-xs font-semibold">
                Cancelar
              </button>
              <button type="submit" disabled={creatingCatBusy || !newCatName.trim()} className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50">
                {creatingCatBusy ? 'Criando...' : 'Criar e Aplicar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

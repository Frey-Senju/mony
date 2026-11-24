'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Sparkles,
  Paperclip,
  Send,
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CreditCard,
  Calendar,
  Trash2,
  Upload,
} from 'lucide-react'
import { useAuth } from '@/stores/auth/useAuth'
import { useCategories } from '@/hooks/useCategories'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ChatItem {
  role: 'user' | 'assistant'
  content: string
}

interface ExtractedItem {
  description: string
  merchant_name?: string | null
  type: 'expense' | 'income' | 'transfer' | 'investment' | 'refund'
  category_name: string
  payment_method: string
  amount: number
  transaction_date: string
  original_purchase_date?: string | null
  statement_month?: string | null
  installment_number?: number | null
  installment_total?: number | null
  confidence?: string
  selected?: boolean
}

interface AnalysisResult {
  engine: string
  llm_connected: boolean
  filename: string
  document_type: string
  issuer?: string | null
  statement_month: string
  summary: string
  items: ExtractedItem[]
}

interface AccountOption {
  id: string
  name: string
  is_default?: boolean
}

const PAYMENT_OPTIONS = [
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'bank_transfer', label: 'Transferência' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'other', label: 'Outro' },
]

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Despesa' },
  { value: 'income', label: 'Receita' },
  { value: 'refund', label: 'Estorno' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'investment', label: 'Investimento' },
]

const QUICK_PROMPTS = [
  'Resumo dos meus gastos este mês',
  'Qual meu saldo total nas contas?',
  'Algum budget está em alerta?',
  'Como estão minhas metas financeiras?',
]

export interface MonyAIDrawerProps {
  open: boolean
  initialTab?: 'chat' | 'import'
  onClose: () => void
}

function renderFormattedText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

export function MonyAIDrawer({ open, initialTab = 'chat', onClose }: MonyAIDrawerProps) {
  const { tokens, refreshToken } = useAuth()
  const token = tokens?.access_token
  const { categories } = useCategories(token)

  // Authenticated fetch that automatically refreshes an expired 15-min JWT once
  const authFetch = useCallback(
    async (url: string, init: RequestInit = {}): Promise<Response> => {
      const currentToken =
        token ||
        (() => {
          try {
            const stored = localStorage.getItem('mony_tokens')
            return stored ? JSON.parse(stored).access_token : null
          } catch {
            return null
          }
        })()

      const makeHeaders = (t: string | null) => {
        const h = new Headers(init.headers || {})
        if (t) h.set('Authorization', `Bearer ${t}`)
        return h
      }

      let res = await fetch(url, { ...init, headers: makeHeaders(currentToken) })
      if (res.status === 401) {
        try {
          const fresh = await refreshToken()
          if (fresh?.access_token) {
            res = await fetch(url, { ...init, headers: makeHeaders(fresh.access_token) })
          }
        } catch {
          // refreshToken already handles logout on invalid refresh_token
        }
      }
      return res
    },
    [token, refreshToken]
  )

  const [tab, setTab] = useState<'chat' | 'import'>(initialTab)
  const [aiStatus, setAiStatus] = useState<{ provider: string; model: string; llm_connected: boolean } | null>(null)

  // Chat state
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: 'assistant',
      content:
        'Olá! Sou a **Mony IA**. Posso analisar seus gastos, saldo, budgets e metas — ou ler faturas de cartão, extratos, boletos e comprovantes PIX na aba **Importar Arquivo**!',
    },
  ])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // File Analyzer & Import state
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [overrideMonth, setOverrideMonth] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [editableItems, setEditableItems] = useState<ExtractedItem[]>([])
  const [targetMonth, setTargetMonth] = useState('')
  const [importing, setImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab, open])

  // Escape closes drawer
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Load AI status + user accounts when opened
  useEffect(() => {
    if (!open || !token) return
    authFetch(`${API_URL}/ai/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setAiStatus(d))
      .catch(() => undefined)

    authFetch(`${API_URL}/accounts`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list: AccountOption[] = Array.isArray(data) ? data : data.items || []
        setAccounts(list)
        if (list.length > 0 && !selectedAccountId) {
          const def = list.find((a) => a.is_default) || list[0]
          setSelectedAccountId(def.id)
        }
      })
      .catch(() => undefined)
  }, [open, token, selectedAccountId, authFetch])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatLoading])

  const sendChat = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !token || chatLoading) return
      const priorHistory = messages.slice(-6)
      const nextHistory: ChatItem[] = [...messages, { role: 'user', content: trimmed }]
      setMessages(nextHistory)
      setInput('')
      setChatLoading(true)
      try {
        const res = await authFetch(`${API_URL}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            history: priorHistory,
          }),
        })
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error(
            res.status === 401
              ? 'Sua sessão expirou. Faça login novamente.'
              : errBody.detail || `Erro ${res.status} ao consultar Mony IA`
          )
        }
        const data = await res.json()
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              err instanceof Error
                ? `Ops, não consegui responder agora: ${err.message}`
                : 'Erro ao conectar com a Mony IA.',
          },
        ])
      } finally {
        setChatLoading(false)
      }
    },
    [token, chatLoading, messages, authFetch]
  )

  const handleFileUpload = async (file: File) => {
    if (!token) return
    setAnalyzing(true)
    setImportError(null)
    setImportSuccess(null)
    setAnalysis(null)
    setEditableItems([])

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (overrideMonth) {
        formData.append('override_month', overrideMonth)
      }
      const res = await authFetch(`${API_URL}/ai/analyze-document`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Não foi possível analisar o documento')
      }
      const data = (await res.json()) as AnalysisResult
      setAnalysis(data)
      setTargetMonth(data.statement_month)
      setEditableItems((data.items || []).map((i) => ({ ...i, selected: true })))
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erro ao analisar arquivo')
    } finally {
      setAnalyzing(false)
    }
  }

  const updateItem = (index: number, patch: Partial<ExtractedItem>) => {
    setEditableItems((prev) => prev.map((it, idx) => (idx === index ? { ...it, ...patch } : it)))
  }

  const handleTargetMonthChange = (nextMonth: string) => {
    setTargetMonth(nextMonth)
    if (!/^\d{4}-\d{2}$/.test(nextMonth)) return
    const [y, m] = nextMonth.split('-').map(Number)
    const maxDay = new Date(y, m, 0).getDate()
    setEditableItems((prev) =>
      prev.map((it) => {
        const existingDay = Number((it.transaction_date || '2026-01-10').slice(8, 10)) || 10
        const clampedDay = String(Math.min(Math.max(1, existingDay), maxDay)).padStart(2, '0')
        return {
          ...it,
          statement_month: nextMonth,
          transaction_date: `${nextMonth}-${clampedDay}`,
        }
      })
    )
  }

  const handleImportConfirm = async () => {
    if (!token || !selectedAccountId) {
      setImportError('Selecione uma conta de destino para importar.')
      return
    }
    const chosen = editableItems.filter((i) => i.selected !== false)
    if (chosen.length === 0) {
      setImportError('Selecione pelo menos um lançamento para importar.')
      return
    }
    setImporting(true)
    setImportError(null)
    try {
      const res = await authFetch(`${API_URL}/ai/import-transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: selectedAccountId,
          statement_month: targetMonth || analysis?.statement_month || new Date().toISOString().slice(0, 7),
          filename: analysis?.filename,
          document_type: analysis?.document_type,
          items: chosen.map(({ selected: _sel, ...rest }) => rest),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao importar transações')
      }
      const result = await res.json()
      setImportSuccess(
        `${result.imported} transação(ões) cadastrada(s) com sucesso no mês ${result.statement_month}!`
      )
      setAnalysis(null)
      setEditableItems([])
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mony:transactions-updated'))
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erro ao importar transações')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  const selectedCount = editableItems.filter((i) => i.selected !== false).length

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mony-ai-title"
    >
      <div className="glass-modal w-full max-w-2xl h-full rounded-none sm:rounded-l-3xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/40 dark:border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
              style={{ background: 'var(--accent)' }}
              aria-hidden="true"
            >
              <Sparkles className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 id="mony-ai-title" className="text-lg font-bold text-slate-900 dark:text-white truncate">
                Mony IA
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {aiStatus?.llm_connected
                  ? `Motor multimodal ativo (${aiStatus.provider} · ${aiStatus.model})`
                  : 'Analisador Financeiro Inteligente (PDF, CSV, TXT, OFX)'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Mony IA"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/10"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Segmented tabs */}
        <div className="px-6 pt-4 pb-2">
          <div
            className="grid grid-cols-2 p-1 rounded-2xl bg-white/50 dark:bg-white/10 border border-white/60 dark:border-white/15"
            role="tablist"
            aria-label="Modos da Mony IA"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'chat'}
              onClick={() => setTab('chat')}
              className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === 'chat' ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              Falar com a IA
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'import'}
              onClick={() => setTab('import')}
              className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === 'import' ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Paperclip className="w-4 h-4" aria-hidden="true" />
              Importar Fatura / Arquivo
            </button>
          </div>
        </div>

        {/* Tab 1: Chat */}
        {tab === 'chat' ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line leading-relaxed ${
                      msg.role === 'user'
                        ? 'liquid-btn-primary rounded-br-md'
                        : 'glass-card rounded-bl-md text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {renderFormattedText(msg.content)}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="glass-card px-4 py-3 text-sm flex items-center gap-2 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Analisando seus dados...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick prompt pills */}
            <div className="px-6 py-2 flex flex-wrap gap-1.5 border-t border-white/30 dark:border-white/10">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp}
                  type="button"
                  onClick={() => sendChat(qp)}
                  className="text-xs px-3 py-1.5 rounded-full bg-white/55 dark:bg-white/10 border border-white/70 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-white/80 dark:hover:bg-white/20 transition"
                >
                  {qp}
                </button>
              ))}
            </div>

            {/* Chat input */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                sendChat(input)
              }}
              className="p-4 px-6 border-t border-white/40 dark:border-white/10 flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() => setTab('import')}
                title="Anexar fatura ou extrato"
                aria-label="Anexar arquivo ou fatura"
                className="liquid-btn liquid-btn-glass p-2.5 rounded-xl shrink-0"
              >
                <Paperclip className="w-4 h-4" aria-hidden="true" />
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pergunte sobre seus gastos, saldo, metas..."
                aria-label="Mensagem para a Mony IA"
                className="input-base flex-1"
              />
              <button
                type="submit"
                disabled={chatLoading || !input.trim()}
                aria-label="Enviar mensagem"
                className="liquid-btn liquid-btn-primary p-2.5 rounded-xl disabled:opacity-50 shrink-0"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        ) : (
          /* Tab 2: Document / Invoice Analyzer & Batch Import */
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {importSuccess && (
              <div
                role="status"
                className="p-4 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 flex items-center gap-2.5 text-sm text-emerald-800 dark:text-emerald-200"
              >
                <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>{importSuccess}</span>
              </div>
            )}

            {importError && (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-red-50/90 dark:bg-red-950/40 border border-red-300 dark:border-red-800 flex items-center gap-2.5 text-sm text-red-700 dark:text-red-300"
              >
                <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>{importError}</span>
              </div>
            )}

            {/* Upload dropzone + optional month override */}
            <div className="glass-card p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ai-account" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Conta destino
                  </label>
                  <select
                    id="ai-account"
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="input-base"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ai-override-month" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Mês da fatura (opcional — auto-detectado)
                  </label>
                  <input
                    id="ai-override-month"
                    type="month"
                    value={overrideMonth}
                    onChange={(e) => setOverrideMonth(e.target.value)}
                    className="input-base"
                  />
                </div>
              </div>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFileUpload(f)
                }}
                className="border-2 border-dashed border-slate-300/80 dark:border-white/20 rounded-2xl p-6 text-center hover:border-primary-500 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.csv,.txt,.ofx,.qfx,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFileUpload(f)
                    e.target.value = ''
                  }}
                  className="hidden"
                />
                {analyzing ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-600" aria-hidden="true" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Analisando fatura, categorias, pagamentos e parcelas...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <Upload className="w-8 h-8 mx-auto text-slate-400" aria-hidden="true" />
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      Arraste sua fatura, extrato, boleto ou comprovante PIX
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      PDF, CSV, TXT, OFX ou Imagem · Parcelas são alocadas automaticamente no <strong>mês da fatura</strong>
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold mt-1"
                    >
                      <FileText className="w-4 h-4" aria-hidden="true" />
                      Selecionar Arquivo
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Analysis Preview & Review */}
            {analysis && (
              <div className="space-y-4">
                <div className="glass-card p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {analysis.document_type}
                        {analysis.issuer ? ` · ${analysis.issuer}` : ''}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        {analysis.summary}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary-600" aria-hidden="true" />
                      <label htmlFor="ai-detected-month" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Mês de lançamento:
                      </label>
                      <input
                        id="ai-detected-month"
                        type="month"
                        value={targetMonth}
                        onChange={(e) => handleTargetMonthChange(e.target.value)}
                        className="input-base w-auto py-1 text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {editableItems.length > 0 && (
                  <div className="space-y-2.5">
                    {editableItems.map((item, idx) => (
                      <div
                        key={idx}
                        className={`glass-card p-3.5 space-y-2.5 transition-opacity ${
                          item.selected === false ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <label className="flex items-start gap-2.5 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={item.selected !== false}
                              onChange={(e) => updateItem(idx, { selected: e.target.checked })}
                              className="mt-1 rounded"
                            />
                            <div className="min-w-0 flex-1">
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => updateItem(idx, { description: e.target.value })}
                                aria-label="Descrição do lançamento"
                                className="w-full bg-transparent font-semibold text-sm text-slate-900 dark:text-white border-b border-transparent focus:border-primary-500 focus:outline-none"
                              />
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {item.merchant_name && (
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/60 dark:bg-white/10 text-slate-700 dark:text-slate-200">
                                    {item.merchant_name}
                                  </span>
                                )}
                                {item.installment_number && item.installment_total && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100/80 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                                    <CreditCard className="w-3 h-3" aria-hidden="true" />
                                    Parcela {item.installment_number}/{item.installment_total}
                                  </span>
                                )}
                                {item.original_purchase_date &&
                                  item.original_purchase_date !== item.transaction_date && (
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                      Compra: {item.original_purchase_date} → Fatura: {item.statement_month || targetMonth}
                                    </span>
                                  )}
                              </div>
                            </div>
                          </label>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              R$ {Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setEditableItems((prev) => prev.filter((_, i) => i !== idx))
                              }
                              aria-label="Remover item"
                              className="p-1 rounded-lg text-slate-400 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <select
                            aria-label="Tipo da transação"
                            value={item.type}
                            onChange={(e) =>
                              updateItem(idx, { type: e.target.value as ExtractedItem['type'] })
                            }
                            className="input-base py-1 text-xs"
                          >
                            {TYPE_OPTIONS.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>

                          <select
                            aria-label="Categoria"
                            value={item.category_name}
                            onChange={(e) => updateItem(idx, { category_name: e.target.value })}
                            className="input-base py-1 text-xs"
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.name}>
                                {c.icon ? `${c.icon} ` : ''}
                                {c.name}
                              </option>
                            ))}
                            {!categories.some(
                              (c) => c.name.toLowerCase() === item.category_name.toLowerCase()
                            ) && <option value={item.category_name}>{item.category_name}</option>}
                          </select>

                          <select
                            aria-label="Forma de pagamento"
                            value={item.payment_method || 'other'}
                            onChange={(e) => updateItem(idx, { payment_method: e.target.value })}
                            className="input-base py-1 text-xs"
                          >
                            {PAYMENT_OPTIONS.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}

                    <div className="pt-2 flex items-center justify-end gap-3 sticky bottom-0 pb-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAnalysis(null)
                          setEditableItems([])
                        }}
                        className="liquid-btn liquid-btn-glass px-4 py-2.5 rounded-xl text-sm font-medium"
                      >
                        Descartar
                      </button>
                      <button
                        type="button"
                        disabled={importing || selectedCount === 0}
                        onClick={handleImportConfirm}
                        className="liquid-btn liquid-btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                      >
                        {importing
                          ? 'Importando...'
                          : `Importar ${selectedCount} transação(ões) em ${targetMonth}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
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
  Camera,
  Mic,
  Square,
  Copy,
  RotateCcw,
} from 'lucide-react'
import { useAuth } from '@/stores/auth/useAuth'
import { useCategories } from '@/hooks/useCategories'
import { SpreadsheetImporterTab } from '@/components/ai/SpreadsheetImporterTab'
import { dispatchToast } from '@/components/ui/ToastProvider'

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
  is_duplicate?: boolean
  duplicate_reason?: string | null
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
  duplicates_detected?: number
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
  'Analise minha carteira B3 e proventos',
  'Como está minha reserva de emergência?',
  'Algum budget está em alerta?',
  'Como estão minhas metas financeiras?',
]

function getContextualPrompts(pathname: string | null): string[] {
  if (!pathname) return QUICK_PROMPTS
  if (pathname.startsWith('/dashboard/cards')) {
    return [
      'Qual cartão é melhor usar hoje?',
      'Quanto tenho comprometido em parcelas futuras?',
      'Resumo das minhas faturas abertas',
      ...QUICK_PROMPTS.slice(0, 2),
    ]
  }
  if (pathname.startsWith('/dashboard/budgets')) {
    return [
      'Onde posso economizar este mês?',
      'Algum budget está em alerta?',
      'Sugira limites ideais pela regra 60/30/10',
      ...QUICK_PROMPTS.slice(0, 2),
    ]
  }
  if (pathname.startsWith('/dashboard/investments')) {
    return [
      'Analise minha carteira B3 e proventos',
      'Como está minha diversificação por setor?',
      'Quanto recebi de dividendos este ano?',
      ...QUICK_PROMPTS.slice(2, 4),
    ]
  }
  if (pathname.startsWith('/dashboard/cashflow')) {
    return [
      'Qual mês teve maior sobra neste ano?',
      'Qual categoria mais cresceu nos últimos meses?',
      'Como está minha reserva de emergência?',
      ...QUICK_PROMPTS.slice(0, 2),
    ]
  }
  if (pathname.startsWith('/dashboard/debts')) {
    return [
      'Qual dívida devo quitar primeiro (Avalanche vs Bola de Neve)?',
      'Como está evoluindo meu patrimônio líquido?',
      ...QUICK_PROMPTS.slice(0, 3),
    ]
  }
  return QUICK_PROMPTS
}

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
  const pathname = usePathname()
  const contextualPrompts = getContextualPrompts(pathname)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
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

  const [tab, setTab] = useState<'chat' | 'copilot' | 'import' | 'spreadsheet'>(initialTab)
  const [aiStatus, setAiStatus] = useState<{ provider: string; model: string; llm_connected: boolean } | null>(null)

  // Copilot (1-click confirmed actions) state
  const [copilotPrompt, setCopilotPrompt] = useState('')
  const [copilotLoading, setCopilotLoading] = useState(false)
  const [copilotExecuting, setCopilotExecuting] = useState(false)
  const [copilotPlan, setCopilotPlan] = useState<{
    action_type: string
    requires_confirmation: boolean
    summary: string
    preview_details: string[]
    payload: Record<string, unknown>
  } | null>(null)
  const [copilotResult, setCopilotResult] = useState<string | null>(null)

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

  // Voice Transaction state (Gemini Multimodal Audio)
  const [recording, setRecording] = useState(false)
  const [voiceParsing, setVoiceParsing] = useState(false)
  const [voiceSaving, setVoiceSaving] = useState(false)
  const [voiceDraft, setVoiceDraft] = useState<{
    transcript: string
    description: string
    type: string
    amount: number
    category_name: string
    payment_method: string
    account_id?: string | null
    account_name?: string | null
    installment_total?: number | null
    transaction_date: string
  } | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

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
  const cameraInputRef = useRef<HTMLInputElement>(null)

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

  const stopRecordingAndParse = useCallback(() => {
    const rec = mediaRecorderRef.current
    if (rec && rec.state !== 'inactive') {
      rec.stop()
    }
    setRecording(false)
  }, [])

  const toggleVoiceRecording = useCallback(async () => {
    if (!token) return
    if (recording) {
      stopRecordingAndParse()
      return
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Seu navegador não suporta gravação de microfone. Digite o comando (ex.: *"Gastei 48 reais no almoço no cartão"*).',
        },
      ])
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      audioChunksRef.current = []
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) audioChunksRef.current.push(ev.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' })
        if (blob.size < 200) return
        setVoiceParsing(true)
        try {
          const fd = new FormData()
          fd.append('audio', blob, mimeType === 'audio/mp4' ? 'voice.m4a' : 'voice.webm')
          if (selectedAccountId) fd.append('account_id', selectedAccountId)
          fd.append('auto_save', 'false')
          const res = await authFetch(`${API_URL}/ai/voice-transaction`, {
            method: 'POST',
            body: fd,
          })
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}))
            throw new Error(errBody.detail || 'Não consegui entender o áudio.')
          }
          const data = await res.json()
          setVoiceDraft(data.parsed)
          setMessages((prev) => [
            ...prev,
            { role: 'user', content: `🎤 "${data.parsed.transcript || 'Áudio enviado'}"` },
            {
              role: 'assistant',
              content: `Entendi **R$ ${Number(data.parsed.amount).toFixed(2).replace('.', ',')}** — **${data.parsed.description}** (${data.parsed.category_name}). Clique em **Confirmar Lançamento** abaixo para salvar em 1 toque!`,
            },
          ])
        } catch (err) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: err instanceof Error ? `Ops: ${err.message}` : 'Não consegui processar o áudio.',
            },
          ])
        } finally {
          setVoiceParsing(false)
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Permissão de microfone negada. Libere o acesso ao microfone no navegador para lançar gastos por voz!',
        },
      ])
    }
  }, [token, recording, stopRecordingAndParse, selectedAccountId, authFetch])

  const confirmVoiceDraft = async () => {
    if (!voiceDraft || !token) return
    setVoiceSaving(true)
    try {
      const fd = new FormData()
      fd.append('transcript', voiceDraft.transcript || `${voiceDraft.description} ${voiceDraft.amount} reais`)
      if (voiceDraft.account_id || selectedAccountId) {
        fd.append('account_id', voiceDraft.account_id || selectedAccountId)
      }
      fd.append('auto_save', 'true')
      const res = await authFetch(`${API_URL}/ai/voice-transaction`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.detail || 'Erro ao salvar lançamento por voz')
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `✅ Lançamento salvo! **R$ ${Number(voiceDraft.amount).toFixed(2).replace('.', ',')}** em **${voiceDraft.category_name}** (${voiceDraft.account_name || 'conta padrão'}).`,
        },
      ])
      setVoiceDraft(null)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mony:transactions-updated'))
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err instanceof Error ? `Erro ao salvar: ${err.message}` : 'Erro ao salvar lançamento.',
        },
      ])
    } finally {
      setVoiceSaving(false)
    }
  }

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
      setEditableItems(
        (data.items || []).map((i) => ({ ...i, selected: i.is_duplicate ? false : true }))
      )
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
      const skippedNote =
        result.skipped_duplicates > 0
          ? ` (${result.skipped_duplicates} duplicata(s) ignorada(s))`
          : ''
      setImportSuccess(
        `${result.imported} transação(ões) cadastrada(s) com sucesso no mês ${result.statement_month}!${skippedNote}`
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

  const handleCopilotPlan = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!copilotPrompt.trim() || copilotLoading) return
    setCopilotLoading(true)
    setCopilotResult(null)
    setCopilotPlan(null)
    try {
      const res = await authFetch(`${API_URL}/ai/copilot/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: copilotPrompt.trim() }),
      })
      if (res.ok) {
        setCopilotPlan(await res.json())
      }
    } finally {
      setCopilotLoading(false)
    }
  }

  const handleCopilotExecute = async () => {
    if (!copilotPlan || !copilotPlan.requires_confirmation || copilotExecuting) return
    setCopilotExecuting(true)
    try {
      const res = await authFetch(`${API_URL}/ai/copilot/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: copilotPlan.action_type,
          payload: copilotPlan.payload,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setCopilotResult(data.message || 'Ação executada com sucesso!')
        setCopilotPlan(null)
        setCopilotPrompt('')
        window.dispatchEvent(new CustomEvent('mony:transactions-updated'))
      } else {
        setCopilotResult(data.detail || 'Não foi possível executar esta ação.')
      }
    } finally {
      setCopilotExecuting(false)
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

          <div className="flex items-center gap-1">
            {tab === 'chat' && messages.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setMessages((prev) => prev.slice(0, 1))
                  dispatchToast('Conversa limpa!', 'info', { durationMs: 2200 })
                }}
                title="Iniciar nova conversa"
                aria-label="Limpar conversa"
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/10 transition"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar Mony IA"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/10"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Segmented tabs */}
        <div className="px-6 pt-4 pb-2">
          <div
            className="grid grid-cols-4 p-1 rounded-2xl bg-white/50 dark:bg-white/10 border border-white/60 dark:border-white/15 gap-0.5"
            role="tablist"
            aria-label="Modos da Mony IA"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'chat'}
              onClick={() => setTab('chat')}
              className={`flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] sm:text-xs font-medium transition-all ${
                tab === 'chat' ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              Chat
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'copilot'}
              onClick={() => setTab('copilot')}
              className={`flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] sm:text-xs font-medium transition-all ${
                tab === 'copilot' ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Copiloto
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'import'}
              onClick={() => setTab('import')}
              className={`flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] sm:text-xs font-medium transition-all ${
                tab === 'import' ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
              Fatura
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'spreadsheet'}
              onClick={() => setTab('spreadsheet')}
              className={`flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] sm:text-xs font-medium transition-all ${
                tab === 'spreadsheet' ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              Planilha
            </button>
          </div>
        </div>

        {/* Tab 4: 2026 Financial Spreadsheet Importer */}
        {tab === 'spreadsheet' ? (
          <SpreadsheetImporterTab
            authFetch={authFetch}
            accounts={accounts}
            defaultAccountId={selectedAccountId}
          />
        ) : tab === 'copilot' ? (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="glass-card p-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <p className="font-bold text-sm text-slate-900 dark:text-white">
                Mony Copiloto — Execute ações em linguagem natural
              </p>
              <p>
                Diga o que deseja fazer. A IA monta um cartão de prévia seguro e só executa após sua confirmação.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  'Criar budget de R$ 900 para Alimentação',
                  'Criar meta Viagem de R$ 8000',
                  'Mudar todas as compras da Uber para Trabalho',
                  'Paguei R$ 145 no PIX no mercado',
                ].map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setCopilotPrompt(ex)}
                    className="px-2.5 py-1 rounded-lg bg-white/60 dark:bg-white/10 hover:bg-white dark:hover:bg-white/15 text-[11px] font-medium text-slate-700 dark:text-slate-200 transition"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleCopilotPlan} className="flex gap-2">
              <input
                type="text"
                value={copilotPrompt}
                onChange={(e) => setCopilotPrompt(e.target.value)}
                placeholder="Ex: Criar budget de R$ 800 para Lazer..."
                className="input-base flex-1"
              />
              <button
                type="submit"
                disabled={copilotLoading || !copilotPrompt.trim()}
                className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {copilotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Planejar'}
              </button>
            </form>

            {copilotResult && (
              <div role="status" className="glass-card p-4 border-emerald-400/60 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {copilotResult}
              </div>
            )}

            {copilotPlan && (
              <div className="glass-card p-5 border-violet-400/50 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">
                  Prévia da Ação ({copilotPlan.action_type})
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{copilotPlan.summary}</p>
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {copilotPlan.preview_details.map((d, i) => (
                    <li key={i}>• {d}</li>
                  ))}
                </ul>
                {copilotPlan.requires_confirmation && (
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setCopilotPlan(null)}
                      className="liquid-btn liquid-btn-glass px-3.5 py-2 rounded-xl text-xs font-medium"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleCopilotExecute}
                      disabled={copilotExecuting}
                      className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50"
                    >
                      {copilotExecuting ? 'Executando...' : 'Confirmar e Executar'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : tab === 'chat' ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`group relative max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line leading-relaxed ${
                      msg.role === 'user'
                        ? 'liquid-btn-primary rounded-br-md'
                        : 'glass-card rounded-bl-md text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {renderFormattedText(msg.content)}
                    {msg.role === 'assistant' && idx > 0 && (
                      <div className="mt-2 pt-1.5 border-t border-white/30 dark:border-white/10 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(msg.content).then(() => {
                              dispatchToast('Resposta copiada!', 'info', { durationMs: 2200 })
                            }).catch(() => undefined)
                          }}
                          title="Copiar resposta"
                          aria-label="Copiar resposta da Mony IA"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition"
                        >
                          <Copy className="w-3 h-3" aria-hidden="true" />
                          Copiar
                        </button>
                      </div>
                    )}
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

            {/* Contextual Quick prompt pills */}
            <div className="px-6 py-2 flex flex-wrap gap-1.5 border-t border-white/30 dark:border-white/10">
              {contextualPrompts.map((qp) => (
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

            {/* Voice 1-Tap Confirmation Card */}
            {voiceDraft && (
              <div className="mx-6 mb-2 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/35 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5" />
                    Confirmar lançamento por voz
                  </span>
                  <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                    R$ {Number(voiceDraft.amount).toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200">
                  <strong>{voiceDraft.description}</strong> · {voiceDraft.category_name} ·{' '}
                  {voiceDraft.account_name || 'Conta padrão'}
                  {voiceDraft.installment_total ? ` · ${voiceDraft.installment_total}x` : ''}
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setVoiceDraft(null)}
                    className="liquid-btn liquid-btn-glass px-3 py-1.5 rounded-xl text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmVoiceDraft}
                    disabled={voiceSaving}
                    className="liquid-btn liquid-btn-primary px-3.5 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50"
                  >
                    {voiceSaving ? 'Salvando...' : 'Confirmar Lançamento'}
                  </button>
                </div>
              </div>
            )}

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
                onClick={toggleVoiceRecording}
                disabled={voiceParsing}
                title={recording ? 'Parar gravação e interpretar' : 'Lançar gasto por voz (Microfone)'}
                aria-label={recording ? 'Parar gravação de voz' : 'Gravar gasto por voz'}
                className={`liquid-btn p-2.5 rounded-xl shrink-0 transition ${
                  recording
                    ? 'bg-rose-500 text-white animate-pulse border-rose-400'
                    : 'liquid-btn-glass'
                }`}
              >
                {voiceParsing ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : recording ? (
                  <Square className="w-4 h-4 fill-current" aria-hidden="true" />
                ) : (
                  <Mic className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setTab('import')}
                title="Anexar fatura ou extrato"
                aria-label="Anexar arquivo ou fatura"
                className="liquid-btn liquid-btn-glass p-2.5 rounded-xl shrink-0"
              >
                <Paperclip className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('import')
                  setTimeout(() => cameraInputRef.current?.click(), 80)
                }}
                title="Tirar foto de recibo ou nota fiscal"
                aria-label="Tirar foto de recibo pela câmera"
                className="liquid-btn liquid-btn-glass p-2.5 rounded-xl shrink-0"
              >
                <Camera className="w-4 h-4" aria-hidden="true" />
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
                onDragEnter={(e) => {
                  e.preventDefault()
                  setIsDraggingFile(true)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!isDraggingFile) setIsDraggingFile(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  setIsDraggingFile(false)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDraggingFile(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFileUpload(f)
                }}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-200 ${
                  isDraggingFile
                    ? 'border-blue-500 bg-blue-500/12 scale-[1.01] shadow-inner'
                    : 'border-slate-300/80 dark:border-white/20 hover:border-primary-500'
                }`}
              >
                {isDraggingFile && (
                  <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-2 animate-pulse">
                    Solte o arquivo aqui para a Mony IA analisar!
                  </p>
                )}
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
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
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
                      Arraste sua fatura, extrato, boleto, comprovante PIX ou tire foto de um recibo
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      PDF, CSV, TXT, OFX ou Foto · Parcelas são alocadas automaticamente no <strong>mês da fatura</strong>
                    </p>
                    <div className="flex items-center justify-center gap-2.5 flex-wrap pt-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                      >
                        <FileText className="w-4 h-4" aria-hidden="true" />
                        Selecionar Arquivo
                      </button>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        data-testid="camera-receipt-btn"
                        className="liquid-btn liquid-btn-glass inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                      >
                        <Camera className="w-4 h-4" aria-hidden="true" />
                        Tirar Foto do Recibo
                      </button>
                    </div>
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
                  {(analysis.duplicates_detected ?? 0) > 0 && (
                    <div
                      role="status"
                      className="px-3 py-2 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300/70 dark:border-amber-800/70 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>
                        <strong>{analysis.duplicates_detected}</strong> possível(is) duplicata(s) já desmarcada(s) automaticamente para evitar lançamento em dobro.
                      </span>
                    </div>
                  )}
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
                                {item.is_duplicate && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100/90 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200"
                                    title={item.duplicate_reason || 'Lançamento semelhante já existe neste mês'}
                                  >
                                    Possível duplicata
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

'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  Plug,
  KeyRound,
  MessageSquare,
  Calendar,
  Webhook,
  Globe2,
  Copy,
  Plus,
  Trash2,
  Play,
  Send,
  FileSpreadsheet,
  ExternalLink,
  CheckCircle2,
  Terminal,
  Undo2,
  BellRing,
  RefreshCw,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { useAuth } from '@/stores/auth/useAuth'
import { dispatchToast } from '@/components/ui/ToastProvider'
import { VoiceQuickEntryButton } from '@/components/transactions/VoiceQuickEntryButton'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type TabId = 'mcp' | 'messaging' | 'calendar' | 'webhooks' | 'fx'

interface ApiKeyItem {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  last_used_at?: string | null
  created_at?: string | null
}

interface ChannelItem {
  id: string
  provider: 'whatsapp' | 'telegram' | 'email_receipt'
  identifier: string
  webhook_token: string
  is_active: boolean
}

interface WebhookItem {
  id: string
  name: string
  url: string
  secret_preview: string
  events: string[]
  last_status_code?: number | null
  last_triggered_at?: string | null
}

interface FxPayload {
  rates_to_brl: Record<string, number>
  by_currency: Record<string, number>
  consolidated_brl: number
}

interface ChatSimMsg {
  role: 'user' | 'bot'
  text: string
  undoTxId?: string
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

export default function IntegrationsPage() {
  return (
    <PrivateRoute>
      <IntegrationsHub />
    </PrivateRoute>
  )
}

function IntegrationsHub() {
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const [tab, setTab] = useState<TabId>('mcp')

  // API Keys & MCP
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([])
  const [newKeyName, setNewKeyName] = useState('Claude / Cursor MCP')
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [mcpTestOutput, setMcpTestOutput] = useState<string | null>(null)

  // Messaging Channels & Simulator
  const [channels, setChannels] = useState<ChannelItem[]>([])
  const [waPhone, setWaPhone] = useState('')
  const [tgChat, setTgChat] = useState('')
  const [emailAlias, setEmailAlias] = useState('')
  const [simInput, setSimInput] = useState('')
  const [simHistory, setSimHistory] = useState<ChatSimMsg[]>([
    {
      role: 'bot',
      text: 'Olá! Teste aqui comandos de WhatsApp/Telegram ou Voz: tente "Gastei 48,90 no Uber no pix", "Recebi 850 freela", "/saldo" ou "/resumo".',
    },
  ])

  // Outgoing Webhooks
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
  const [whName, setWhName] = useState('')
  const [whUrl, setWhUrl] = useState('')

  // FX Multi-currency
  const [fx, setFx] = useState<FxPayload | null>(null)
  const [convAmount, setConvAmount] = useState('100')
  const [convFrom, setConvFrom] = useState('USD')

  // Track 3: Automation Diagnostics, Manual Watchlist/Alerts Scan & Browser Push
  const [diag, setDiag] = useState<Record<string, boolean> | null>(null)
  const [scanningNow, setScanningNow] = useState(false)
  const [pushPerm, setPushPerm] = useState<string>('default')

  useEffect(() => {
    document.title = 'Mony · Integrações, MCP, WhatsApp & Webhooks'
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPerm(Notification.permission)
    }
  }, [])

  const loadAll = useCallback(async () => {
    if (!token) return
    const h = { Authorization: `Bearer ${token}` }
    const [kRes, cRes, wRes, fRes, dRes] = await Promise.all([
      fetch(`${API_URL}/integrations/api-keys`, { headers: h }).catch(() => null),
      fetch(`${API_URL}/integrations/channels`, { headers: h }).catch(() => null),
      fetch(`${API_URL}/integrations/webhooks`, { headers: h }).catch(() => null),
      fetch(`${API_URL}/integrations/fx-rates`, { headers: h }).catch(() => null),
      fetch(`${API_URL}/health/diagnostics`).catch(() => null),
    ])
    if (kRes?.ok) setApiKeys((await kRes.json()).items || [])
    if (cRes?.ok) setChannels((await cRes.json()).items || [])
    if (wRes?.ok) setWebhooks((await wRes.json()).items || [])
    if (fRes?.ok) setFx(await fRes.json())
    if (dRes?.ok) {
      const dd = await dRes.json()
      setDiag(dd.channels || null)
    }
  }, [token])

  const triggerAutomationScan = async () => {
    if (!token || scanningNow) return
    setScanningNow(true)
    try {
      const res = await fetch(`${API_URL}/cron/run-my-scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const d = await res.json()
        const hits = d.watchlist?.hits?.length || 0
        dispatchToast(
          hits > 0
            ? `Varredura concluída! ${hits} ativo(s) da Watchlist abaixo do Preço-Teto + alertas sincronizados.`
            : `Varredura concluída! Alertas financeiros e ${d.watchlist?.checked || 0} ativo(s) da Watchlist verificados.`,
          'success'
        )
      }
    } finally {
      setScanningNow(false)
    }
  }

  const enableBrowserPush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      dispatchToast('Este navegador não suporta notificações Web Push.', 'error')
      return
    }
    const perm = await Notification.requestPermission()
    setPushPerm(perm)
    if (perm === 'granted') {
      dispatchToast('Notificações do navegador ativadas para alertas do Mony!', 'success')
    }
  }

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const copyText = (txt: string, label: string) => {
    navigator.clipboard?.writeText(txt).then(() => {
      dispatchToast(`${label} copiado!`, 'success')
    }).catch(() => undefined)
  }

  const createApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !newKeyName.trim()) return
    const res = await fetch(`${API_URL}/integrations/api-keys`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newKeyName.trim(), scopes: ['read', 'write', 'mcp', 'calendar_ics'] }),
    })
    if (res.ok) {
      const data = await res.json()
      setFreshKey(data.api_key)
      setNewKeyName('')
      dispatchToast('API Key criada! Copie agora — ela não será exibida novamente.', 'success')
      await loadAll()
    }
  }

  const revokeKey = async (id: string) => {
    if (!token) return
    await fetch(`${API_URL}/integrations/api-keys/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    dispatchToast('API Key revogada.', 'info')
    await loadAll()
  }

  const testMcpLive = async () => {
    if (!token) return
    const res = await fetch(`${API_URL}/integrations/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_balance', arguments: {} },
      }),
    })
    if (res.ok) {
      setMcpTestOutput(JSON.stringify(await res.json(), null, 2))
      dispatchToast('Servidor MCP do Mony respondeu com sucesso!', 'success')
    }
  }

  const saveChannel = async (provider: 'whatsapp' | 'telegram' | 'email_receipt', identifier: string) => {
    if (!token || !identifier.trim()) return
    const res = await fetch(`${API_URL}/integrations/channels`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, identifier: identifier.trim() }),
    })
    if (res.ok) {
      dispatchToast(`Canal ${provider} salvo e token gerado!`, 'success')
      await loadAll()
    }
  }

  const sendSimMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !simInput.trim()) return
    const txt = simInput.trim()
    setSimInput('')
    setSimHistory((prev) => [...prev, { role: 'user', text: txt }])
    const res = await fetch(`${API_URL}/integrations/nl-entry`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: txt, source_tag: '#whatsapp' }),
    })
    const data = await res.json().catch(() => ({}))
    setSimHistory((prev) => [
      ...prev,
      {
        role: 'bot',
        text: data.reply || data.detail || 'Processado.',
        undoTxId: data.transaction?.id,
      },
    ])
    if (data.transaction?.id) {
      window.dispatchEvent(new Event('mony:transactions-updated'))
    }
  }

  const undoSimTx = async (txId: string) => {
    if (!token) return
    await fetch(`${API_URL}/transactions/${txId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    window.dispatchEvent(new Event('mony:transactions-updated'))
    dispatchToast('Lançamento desfeito!', 'info')
  }

  const createWebhook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !whName.trim() || !whUrl.trim()) return
    const res = await fetch(`${API_URL}/integrations/webhooks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: whName.trim(), url: whUrl.trim() }),
    })
    if (res.ok) {
      setWhName('')
      setWhUrl('')
      dispatchToast('Webhook cadastrado!', 'success')
      await loadAll()
    }
  }

  const testWebhook = async (id: string) => {
    if (!token) return
    const res = await fetch(`${API_URL}/integrations/webhooks/${id}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const d = await res.json()
      dispatchToast(
        d.delivered ? `Webhook entregue (HTTP ${d.status_code})!` : `Falha ao entregar (${d.error || d.status_code})`,
        d.delivered ? 'success' : 'error'
      )
      await loadAll()
    }
  }

  const deleteWebhook = async (id: string) => {
    if (!token) return
    await fetch(`${API_URL}/integrations/webhooks/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    await loadAll()
  }

  const downloadSheetsCsv = async () => {
    if (!token) return
    const res = await fetch(`${API_URL}/integrations/sheets-export`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mony-google-sheets-${new Date().getFullYear()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    dispatchToast('Planilha CSV pronta para importar no Google Sheets / Excel!', 'success')
  }

  const mcpSnippet = JSON.stringify(
    {
      mcpServers: {
        mony: {
          url: `${API_URL}/integrations/mcp`,
          headers: {
            Authorization: `Bearer ${freshKey || 'SUA_MONY_API_KEY'}`,
          },
        },
      },
    },
    null,
    2
  )

  const icsUrl = `${API_URL}/integrations/calendar.ics?token=${encodeURIComponent(freshKey || 'SUA_MONY_API_KEY')}`
  const waCh = channels.find((c) => c.provider === 'whatsapp')
  const tgCh = channels.find((c) => c.provider === 'telegram')
  const emCh = channels.find((c) => c.provider === 'email_receipt')

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <header className="glass-panel p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
              style={{ background: 'var(--accent)' }}
            >
              <Plug className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                Central de Integrações, MCP &amp; Portais
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Servidor MCP (Claude/ChatGPT/Cursor), WhatsApp/Telegram/Voz, Google Agenda (.ics), Google Sheets, Webhooks &amp; Multi-Moeda
              </p>
            </div>
          </div>
          <VoiceQuickEntryButton token={token} />
        </div>

        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/40 dark:border-white/10" role="tablist">
          {(
            [
              { id: 'mcp', label: 'MCP & API Keys', icon: KeyRound },
              { id: 'messaging', label: 'WhatsApp, Telegram & Voz', icon: MessageSquare },
              { id: 'calendar', label: 'Google Agenda (.ics) & Sheets', icon: Calendar },
              { id: 'webhooks', label: 'Webhooks (Zapier / n8n / Slack)', icon: Webhook },
              { id: 'fx', label: 'Multi-Moeda (USD/EUR/GBP)', icon: Globe2 },
            ] as const
          ).map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                  tab === t.id ? 'liquid-nav-active shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
      </header>

      {/* Track 3: Automações Cron Diário (07h BRT), Watchlist Valuer, E-mail Resend & Web Push */}
      <section className="glass-card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <BellRing className="w-4 h-4 text-[var(--accent)]" />
            Motor de Automações Ativo (Cron Diário 07h BRT · Watchlist Preço-Teto · E-mail Resend · Web Push)
          </p>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
            <span className={`px-2 py-0.5 rounded-full ${diag?.cron_secret_configured ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300'}`}>
              Cron Diário: {diag?.cron_secret_configured ? 'Ativo' : 'Pronto (aguarda CRON_SECRET)'}
            </span>
            <span className={`px-2 py-0.5 rounded-full ${diag?.email_resend_configured ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300'}`}>
              E-mail Resend: {diag?.email_resend_configured ? 'Ativo' : 'Modo Dry-Run'}
            </span>
            <span className={`px-2 py-0.5 rounded-full ${pushPerm === 'granted' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'}`}>
              Push Navegador: {pushPerm === 'granted' ? 'Autorizado' : 'Pendente'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {pushPerm !== 'granted' && (
            <button
              type="button"
              onClick={enableBrowserPush}
              className="liquid-btn liquid-btn-glass px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <BellRing className="w-3.5 h-3.5" />
              Ativar Web Push
            </button>
          )}
          <button
            type="button"
            onClick={triggerAutomationScan}
            disabled={scanningNow}
            className="liquid-btn liquid-btn-primary px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanningNow ? 'animate-spin' : ''}`} />
            {scanningNow ? 'Varrendo...' : 'Disparar Varredura Agora'}
          </button>
        </div>
      </section>

      {/* TAB 1: MCP SERVER & API KEYS */}
      {tab === 'mcp' && (
        <div className="space-y-5">
          <div className="glass-panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Servidor MCP Nativo do Mony (Model Context Protocol)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Conecte <strong>Claude Desktop, ChatGPT, Cursor, Windsurf ou Antigravity</strong> direto aos seus saldos, lançamentos e Mony Valuer B3.
                </p>
              </div>
              <button
                type="button"
                onClick={testMcpLive}
                className="liquid-btn liquid-btn-primary px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Terminal className="w-3.5 h-3.5" />
                Testar MCP Agora
              </button>
            </div>

            <form onSubmit={createApiKey} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Nome da chave (ex: Claude Desktop, Google Agenda)"
                className="liquid-input text-xs flex-1 min-w-[220px]"
                required
              />
              <button type="submit" className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                Gerar Nova API Key
              </button>
            </form>

            {freshKey && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-400/40 space-y-2 text-xs">
                <p className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Chave gerada (copie agora — exibida uma única vez):
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 rounded-xl bg-slate-950/80 text-emerald-300 font-mono text-[11px] overflow-x-auto">
                    {freshKey}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText(freshKey, 'API Key')}
                    className="liquid-btn liquid-btn-glass px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </button>
                </div>
              </div>
            )}

            {/* MCP JSON Config Snippet */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  Configuração MCP pronta (Claude / Cursor / Antigravity):
                </span>
                <button
                  type="button"
                  onClick={() => copyText(mcpSnippet, 'JSON MCP')}
                  className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar JSON
                </button>
              </div>
              <pre className="p-3.5 rounded-2xl bg-slate-950/90 text-slate-100 text-[11px] font-mono overflow-x-auto">
                {mcpSnippet}
              </pre>
            </div>

            {mcpTestOutput && (
              <pre className="p-3.5 rounded-2xl bg-emerald-950/80 text-emerald-200 text-[11px] font-mono overflow-x-auto">
                {mcpTestOutput}
              </pre>
            )}

            {/* Active Keys List */}
            {apiKeys.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Chaves Ativas ({apiKeys.length})</p>
                {apiKeys.map((k) => (
                  <div key={k.id} className="glass-card p-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{k.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {k.key_prefix} · Escopos: {k.scopes.join(', ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => revokeKey(k.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500"
                      aria-label={`Revogar ${k.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: WHATSAPP, TELEGRAM, EMAIL & LIVE SIMULATOR */}
      {tab === 'messaging' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-6 space-y-4">
            <div className="glass-panel p-5 space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Canais Conectados (WhatsApp · Telegram · E-mail Recibos)
              </h2>
              {/* WhatsApp */}
              <div className="glass-card p-4 space-y-2.5">
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  💬 WhatsApp (Cloud API / Evolution API)
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={waPhone || waCh?.identifier || ''}
                    onChange={(e) => setWaPhone(e.target.value)}
                    placeholder="+5511999999999"
                    className="liquid-input text-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => saveChannel('whatsapp', waPhone || waCh?.identifier || '')}
                    className="liquid-btn liquid-btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold"
                  >
                    Salvar
                  </button>
                </div>
                {waCh && (
                  <div className="text-[11px] text-slate-500 space-y-1">
                    <p>Endpoint Webhook: <code>{API_URL}/integrations/webhook/inbound/whatsapp</code></p>
                    <button
                      type="button"
                      onClick={() => copyText(waCh.webhook_token, 'Token WhatsApp')}
                      className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Copiar Token: {waCh.webhook_token.slice(0, 14)}...
                    </button>
                  </div>
                )}
              </div>

              {/* Telegram */}
              <div className="glass-card p-4 space-y-2.5">
                <p className="text-xs font-bold text-sky-700 dark:text-sky-300">✈️ Telegram Bot</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tgChat || tgCh?.identifier || ''}
                    onChange={(e) => setTgChat(e.target.value)}
                    placeholder="@seu_usuario ou chat_id"
                    className="liquid-input text-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => saveChannel('telegram', tgChat || tgCh?.identifier || '')}
                    className="liquid-btn liquid-btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold"
                  >
                    Salvar
                  </button>
                </div>
                {tgCh && (
                  <p className="text-[11px] text-slate-500">
                    Webhook: <code>{API_URL}/integrations/webhook/inbound/telegram</code> · Token: <code>{tgCh.webhook_token.slice(0, 14)}...</code>
                  </p>
                )}
              </div>

              {/* Email Receipt Forwarding */}
              <div className="glass-card p-4 space-y-2.5">
                <p className="text-xs font-bold text-violet-700 dark:text-violet-300">
                  📧 Encaminhamento de Recibos por E-mail (Estilo Expensify)
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailAlias || emCh?.identifier || ''}
                    onChange={(e) => setEmailAlias(e.target.value)}
                    placeholder="seu-email@gmail.com (remetente autorizado)"
                    className="liquid-input text-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => saveChannel('email_receipt', emailAlias || emCh?.identifier || '')}
                    className="liquid-btn liquid-btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold"
                  >
                    Ativar
                  </button>
                </div>
                {emCh && (
                  <p className="text-[11px] text-slate-500">
                    Webhook Inbound (Mailgun/Postmark/Resend): <code>{API_URL}/integrations/webhook/inbound/email_receipt</code>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Live WhatsApp/Voice Interactive Simulator */}
          <div className="lg:col-span-6 glass-panel p-5 flex flex-col justify-between gap-4 min-h-[420px]">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Simulador ao Vivo · Chat &amp; Voz (Ação Real no Mony)
              </h2>
              <p className="text-xs text-slate-500">
                Cada mensagem abaixo cria lançamentos reais ou consulta saldos instantaneamente com botão <strong>Desfazer</strong>
              </p>
            </div>

            <div className="flex-1 space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {simHistory.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs space-y-1.5 whitespace-pre-line ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'glass-card text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <p>{m.text}</p>
                    {m.undoTxId && (
                      <button
                        type="button"
                        onClick={() => undoSimTx(m.undoTxId!)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold text-[11px]"
                      >
                        <Undo2 className="w-3 h-3" /> Desfazer lançamento
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={sendSimMessage} className="flex items-center gap-2">
              <input
                type="text"
                value={simInput}
                onChange={(e) => setSimInput(e.target.value)}
                placeholder='Ex: "Gastei 52,50 no mercado no pix" ou "/saldo"'
                className="liquid-input text-xs flex-1"
              />
              <VoiceQuickEntryButton token={token} compact />
              <button type="submit" className="liquid-btn liquid-btn-primary p-2.5 rounded-xl" aria-label="Enviar">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: GOOGLE CALENDAR (.ICS) & GOOGLE SHEETS */}
      {tab === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Google Agenda / Apple Calendar / Outlook (.ics)
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Assine este feed iCalendar no seu aplicativo de agenda favorito para visualizar automaticamente todos os seus{' '}
              <strong>vencimentos de contas fixas, fechamento/vencimento de cartões e prazos de metas</strong>.
            </p>
            <div className="p-3 rounded-xl bg-slate-950/85 text-blue-200 font-mono text-[11px] break-all">
              {icsUrl}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyText(icsUrl, 'Link .ics do Calendário')}
                className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" /> Copiar Link .ics
              </button>
              <a
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(icsUrl.replace(/^https?:\/\//, 'webcal://'))}`}
                target="_blank"
                rel="noreferrer"
                className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Assinar no Google Agenda
              </a>
            </div>
            {!freshKey && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Dica: Gere uma <strong>API Key</strong> na aba <em>MCP &amp; API Keys</em> para preencher automaticamente o token seguro no link acima.
              </p>
            )}
          </div>

          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Google Planilhas &amp; Exportação Contábil
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Exporte todo o ano atual em formato CSV padronizado (UTF-8 com coluna <code>SignedAmount</code> e <code>Currency</code>), pronto para abrir direto no <strong>Google Sheets, Excel, QuickBooks ou Xero</strong>.
            </p>
            <button
              type="button"
              onClick={downloadSheetsCsv}
              className="liquid-btn liquid-btn-primary px-4 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Baixar CSV Google Sheets / Contabilidade
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: OUTGOING WEBHOOKS */}
      {tab === 'webhooks' && (
        <div className="glass-panel p-5 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Webhooks de Saída (Zapier · Make · n8n · Slack · Discord)
            </h2>
            <p className="text-xs text-slate-500">
              Receba eventos assinados com HMAC-SHA256 (<code>X-Mony-Signature</code>) no seu fluxo de automação.
            </p>
          </div>

          <form onSubmit={createWebhook} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              value={whName}
              onChange={(e) => setWhName(e.target.value)}
              placeholder="Nome (ex: Slack Alertas / n8n)"
              className="liquid-input text-xs"
              required
            />
            <input
              type="url"
              value={whUrl}
              onChange={(e) => setWhUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="liquid-input text-xs"
              required
            />
            <button type="submit" className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" /> Adicionar Webhook
            </button>
          </form>

          <div className="space-y-2.5">
            {webhooks.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Nenhum webhook configurado ainda.</p>
            ) : (
              webhooks.map((w) => (
                <div key={w.id} className="glass-card p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white">{w.name}</p>
                    <p className="text-[11px] text-slate-500 truncate max-w-md font-mono">{w.url}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Eventos: {w.events.join(', ')}{' '}
                      {w.last_status_code !== null && w.last_status_code !== undefined && (
                        <span>· Último HTTP: <strong>{w.last_status_code}</strong></span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => testWebhook(w.id)}
                      className="liquid-btn liquid-btn-glass px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <Play className="w-3.5 h-3.5" /> Testar
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteWebhook(w.id)}
                      aria-label={`Excluir ${w.name}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: MULTI-CURRENCY FX */}
      {tab === 'fx' && fx && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(['USD', 'EUR', 'GBP'] as const).map((cur) => (
              <div key={cur} className="glass-card p-4">
                <p className="text-xs font-semibold text-slate-500">{cur} → BRL (ao vivo)</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {brl(fx.rates_to_brl[cur] || 1)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Saldo em {cur}: <strong>{(fx.by_currency[cur] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                </p>
              </div>
            ))}
            <div className="glass-card p-4 border-emerald-400/40 bg-emerald-500/8">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Consolidado Multi-Moeda (BRL)
              </p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums money-value">
                {brl(fx.consolidated_brl)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Todas as moedas convertidas ao vivo</p>
            </div>
          </div>

          <div className="glass-panel p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Conversor Rápido Multi-Moeda</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <input
                type="number"
                value={convAmount}
                onChange={(e) => setConvAmount(e.target.value)}
                className="liquid-input text-sm font-bold tabular-nums"
              />
              <select
                value={convFrom}
                onChange={(e) => setConvFrom(e.target.value)}
                className="liquid-input text-sm font-semibold"
              >
                <option value="USD">🇺🇸 Dólar (USD)</option>
                <option value="EUR">🇪🇺 Euro (EUR)</option>
                <option value="GBP">🇬🇧 Libra (GBP)</option>
              </select>
              <div className="glass-card p-3 text-center">
                <span className="text-[11px] text-slate-500 block">Equivalente em Reais</span>
                <strong className="text-lg text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {brl((Number(convAmount) || 0) * (fx.rates_to_brl[convFrom] || 1))}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

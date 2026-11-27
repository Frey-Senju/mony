'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Sparkles,
  Paperclip,
  EyeOff,
  Eye,
  Sun,
  Moon,
  LayoutDashboard,
  Table2,
  Calendar,
  TrendingUp,
  CreditCard,
  Wallet,
  Repeat,
  BarChart3,
  PieChart,
  ShieldCheck,
  Target,
  SlidersHorizontal,
  Calculator,
  Landmark,
  Palette,
  UserCircle,
  Scale,
  Keyboard,
  X,
  ArrowRight,
  Download,
  Receipt,
} from 'lucide-react'
import { useAppearance } from '@/app/_theme/provider'
import { useAuth } from '@/stores/auth/useAuth'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface GlobalSearchResult {
  transactions: Array<{
    id: string
    description: string
    amount: number
    type: string
    date: string
    statement_month: string
    category_name: string
  }>
  accounts: Array<{ id: string; name: string; balance: number; icon?: string | null }>
  goals: Array<{ id: string; name: string; current_amount: number; target_amount: number }>
  cards: Array<{ id: string; name: string; brand: string; last4?: string | null }>
}

function brlShort(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onOpenAI: (tab: 'chat' | 'import') => void
}

interface CommandItem {
  id: string
  label: string
  subtitle?: string
  group: 'Resultados' | 'Ações Rápidas' | 'Navegação' | 'Configurações'
  keywords: string
  icon: React.ReactNode
  shortcut?: string
  run: () => void
}

export function CommandPalette({ open, onClose, onOpenAI }: CommandPaletteProps) {
  const router = useRouter()
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const { settings, resolvedTheme, toggleDarkMode, togglePrivacyMode } = useAppearance()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchResults, setSearchResults] = useState<GlobalSearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Live debounced global search across transactions, accounts, goals & cards
  useEffect(() => {
    if (!open || !token) return
    const q = query.trim()
    if (q.length < 2) {
      setSearchResults(null)
      setSearching(false)
      return
    }
    let active = true
    setSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/insights/global-search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (active && res.ok) {
          setSearchResults(await res.json())
        }
      } catch {
        // silent fallback
      } finally {
        if (active) setSearching(false)
      }
    }, 220)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [open, token, query])

  const commands = useMemo<CommandItem[]>(() => {
    const go = (href: string) => () => {
      onClose()
      router.push(href)
    }
    return [
      {
        id: 'act-ai-chat',
        label: 'Falar com a Mony IA (Copiloto & Voz)',
        subtitle: 'Fazer perguntas, simular cenários ou executar ações',
        group: 'Ações Rápidas',
        keywords: 'ia chat voz copiloto assistente gemini',
        icon: <Sparkles className="w-4 h-4 text-violet-500" aria-hidden="true" />,
        run: () => {
          onClose()
          onOpenAI('chat')
        },
      },
      {
        id: 'act-ai-import',
        label: 'Importar Fatura, Extrato ou Recibo',
        subtitle: 'PDF, CSV, OFX ou foto pela câmera',
        group: 'Ações Rápidas',
        keywords: 'importar fatura pdf csv foto recibo boleto pix',
        icon: <Paperclip className="w-4 h-4 text-blue-500" aria-hidden="true" />,
        run: () => {
          onClose()
          onOpenAI('import')
        },
      },
      {
        id: 'act-privacy',
        label: settings.privacyMode ? 'Desativar Modo Privacidade' : 'Ativar Modo Privacidade (Ocultar R$)',
        subtitle: 'Borra valores monetários na tela',
        group: 'Ações Rápidas',
        keywords: 'privacidade ocultar esconder valores olho blur',
        shortcut: 'Shift+P',
        icon: settings.privacyMode ? (
          <Eye className="w-4 h-4 text-emerald-500" aria-hidden="true" />
        ) : (
          <EyeOff className="w-4 h-4 text-amber-500" aria-hidden="true" />
        ),
        run: () => {
          togglePrivacyMode()
          onClose()
        },
      },
      {
        id: 'act-theme',
        label: resolvedTheme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro',
        group: 'Ações Rápidas',
        keywords: 'tema escuro claro dark light',
        icon:
          resolvedTheme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" aria-hidden="true" />
          ),
        run: () => {
          toggleDarkMode()
          onClose()
        },
      },
      {
        id: 'nav-dashboard',
        label: 'Dashboard Principal',
        group: 'Navegação',
        keywords: 'inicio home resumo transacoes dashboard',
        icon: <LayoutDashboard className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard'),
      },
      {
        id: 'nav-cashflow',
        label: 'Cashflow Anual & Planilha Editável',
        group: 'Navegação',
        keywords: 'cashflow planilha meses fluxo caixa anual',
        icon: <Table2 className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/cashflow'),
      },
      {
        id: 'nav-calendar',
        label: 'Calendário Financeiro & Projeção 90d',
        group: 'Navegação',
        keywords: 'calendario vencimentos projecao 90 dias saldo futuro',
        icon: <Calendar className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/calendar'),
      },
      {
        id: 'nav-ai-review',
        label: 'Revisão Proativa da IA',
        group: 'Navegação',
        keywords: 'revisao ia sugestoes auditoria fatura transferencia',
        icon: <ShieldCheck className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/ai-review'),
      },
      {
        id: 'nav-investments',
        label: 'Investimentos B3 & Dividendos',
        group: 'Navegação',
        keywords: 'investimentos b3 acoes fiis cdi rebalanceamento irpf',
        icon: <TrendingUp className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/investments'),
      },
      {
        id: 'nav-valuer',
        label: 'Mony Valuer · Preço Teto, Radar B3 & Mata-Mata',
        group: 'Navegação',
        keywords: 'valuer adapta preco teto bazin graham gordon radar barganha dividendos mata-mata markets academy',
        icon: <Sparkles className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/valuer'),
      },
      {
        id: 'nav-integrations',
        label: 'Integrações, Servidor MCP, WhatsApp, .ics & Webhooks',
        group: 'Configurações',
        keywords: 'integracoes mcp claude chatgpt whatsapp telegram google agenda ics webhooks zapier n8n multi moeda fx',
        icon: <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />,
        run: go('/settings/integrations'),
      },
      {
        id: 'nav-debts',
        label: 'Dívidas, Financiamentos & Patrimônio Líquido',
        group: 'Navegação',
        keywords: 'dividas emprestimos financiamento sac price avalanche bola neve patrimonio net worth',
        icon: <Scale className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/debts'),
      },
      {
        id: 'nav-cards',
        label: 'Cartões de Crédito',
        group: 'Navegação',
        keywords: 'cartoes credito limite fatura fechamento',
        icon: <CreditCard className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/cards'),
      },
      {
        id: 'nav-accounts',
        label: 'Contas & Categorias',
        group: 'Navegação',
        keywords: 'contas bancos saldo categorias',
        icon: <Wallet className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/accounts'),
      },
      {
        id: 'nav-recurring',
        label: 'Recorrentes & Assinaturas',
        group: 'Navegação',
        keywords: 'recorrentes fixas assinaturas netflix aluguel salario',
        icon: <Repeat className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/recurring'),
      },
      {
        id: 'nav-budgets',
        label: 'Budgets Inteligentes',
        group: 'Navegação',
        keywords: 'budgets orcamentos limites gastos',
        icon: <PieChart className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/budgets'),
      },
      {
        id: 'nav-reports',
        label: 'Relatórios 2.0 & Exportação Excel',
        group: 'Navegação',
        keywords: 'relatorios graficos excel xlsx csv pdf acessivel',
        icon: <BarChart3 className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/reports'),
      },
      {
        id: 'nav-insights',
        label: 'Insights, Score de Saúde & Radar',
        group: 'Navegação',
        keywords: 'insights score saude mony review radar assinaturas',
        icon: <Sparkles className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/insights'),
      },
      {
        id: 'nav-goals',
        label: 'Metas Financeiras 2.0',
        group: 'Navegação',
        keywords: 'metas objetivos reserva viagem cdi',
        icon: <Target className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/goals'),
      },
      {
        id: 'nav-simulators',
        label: 'Simuladores (Investimentos, Salário & E se...?)',
        group: 'Navegação',
        keywords: 'simuladores salario inss irrf juros compostos e se',
        icon: <Calculator className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/simulators'),
      },
      {
        id: 'nav-rules',
        label: 'Regras Automáticas',
        group: 'Navegação',
        keywords: 'regras categorizacao automatica',
        icon: <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />,
        run: go('/dashboard/rules'),
      },
      {
        id: 'cfg-connections',
        label: 'Conexões Open Finance (Pluggy)',
        group: 'Configurações',
        keywords: 'open finance pluggy conectar bancos sincronizar',
        icon: <Landmark className="w-4 h-4" aria-hidden="true" />,
        run: go('/settings/connections'),
      },
      {
        id: 'cfg-appearance',
        label: 'Aparência, Daltonismo & Acessibilidade',
        group: 'Configurações',
        keywords: 'aparencia acessibilidade daltonismo contraste liquid glass fonte',
        icon: <Palette className="w-4 h-4" aria-hidden="true" />,
        run: go('/settings/appearance'),
      },
      {
        id: 'act-backup',
        label: 'Exportar Backup Completo da Conta (JSON)',
        subtitle: 'Baixa 100% dos seus lançamentos, contas, metas e regras',
        group: 'Ações Rápidas',
        keywords: 'backup exportar json portabilidade dados download',
        icon: <Download className="w-4 h-4 text-emerald-500" aria-hidden="true" />,
        run: async () => {
          onClose()
          if (!token) return
          try {
            const res = await fetch(`${API_URL}/auth/export-backup`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) throw new Error('Falha ao gerar backup')
            const data = await res.json()
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `mony-backup-${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(url)
            dispatchToast(`Backup salvo (${data?.counts?.transactions ?? 0} lançamentos)!`, 'success')
          } catch {
            dispatchToast('Não foi possível gerar o backup agora.', 'error')
          }
        },
      },
      {
        id: 'cfg-profile',
        label: 'Perfil, Senha, 2FA & Backup',
        group: 'Configurações',
        keywords: 'perfil conta senha seguranca 2fa backup',
        icon: <UserCircle className="w-4 h-4" aria-hidden="true" />,
        run: go('/settings/profile'),
      },
    ]
  }, [onClose, onOpenAI, resolvedTheme, router, settings.privacyMode, toggleDarkMode, togglePrivacyMode, token])

  const dynamicItems = useMemo<CommandItem[]>(() => {
    if (!searchResults) return []
    const items: CommandItem[] = []
    for (const tx of searchResults.transactions || []) {
      items.push({
        id: `tx-${tx.id}`,
        label: tx.description,
        subtitle: `${tx.date.slice(8, 10)}/${tx.date.slice(5, 7)}/${tx.date.slice(0, 4)} · ${tx.category_name} · ${tx.type === 'income' ? '+' : '-'}${brlShort(tx.amount)}`,
        group: 'Resultados',
        keywords: tx.description.toLowerCase(),
        icon: <Receipt className={`w-4 h-4 ${tx.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`} aria-hidden="true" />,
        run: () => {
          onClose()
          router.push(`/dashboard?month=${encodeURIComponent(tx.statement_month)}`)
        },
      })
    }
    for (const acc of searchResults.accounts || []) {
      items.push({
        id: `acc-${acc.id}`,
        label: `${acc.icon || '🏦'} ${acc.name}`,
        subtitle: `Conta · Saldo ${brlShort(acc.balance)}`,
        group: 'Resultados',
        keywords: acc.name.toLowerCase(),
        icon: <Wallet className="w-4 h-4 text-blue-500" aria-hidden="true" />,
        run: () => {
          onClose()
          router.push('/dashboard/accounts')
        },
      })
    }
    for (const g of searchResults.goals || []) {
      items.push({
        id: `goal-${g.id}`,
        label: g.name,
        subtitle: `Meta · ${brlShort(g.current_amount)} / ${brlShort(g.target_amount)}`,
        group: 'Resultados',
        keywords: g.name.toLowerCase(),
        icon: <Target className="w-4 h-4 text-violet-500" aria-hidden="true" />,
        run: () => {
          onClose()
          router.push('/dashboard/goals')
        },
      })
    }
    for (const c of searchResults.cards || []) {
      items.push({
        id: `card-${c.id}`,
        label: c.name,
        subtitle: `Cartão ${c.brand.toUpperCase()}${c.last4 ? ` · •••• ${c.last4}` : ''}`,
        group: 'Resultados',
        keywords: c.name.toLowerCase(),
        icon: <CreditCard className="w-4 h-4 text-amber-500" aria-hidden="true" />,
        run: () => {
          onClose()
          router.push('/dashboard/cards')
        },
      })
    }
    return items
  }, [searchResults, onClose, router])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    const staticMatches = commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(q)) ||
        c.keywords.includes(q)
    )
    return [...dynamicItems, ...staticMatches]
  }, [commands, dynamicItems, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) =>
          filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
        )
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault()
        filtered[selectedIndex].run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, selectedIndex, onClose])

  if (!open) return null

  const groups: Array<CommandItem['group']> = ['Resultados', 'Ações Rápidas', 'Navegação', 'Configurações']

  return (
    <div
      className="fixed inset-0 z-[65] bg-slate-950/50 backdrop-blur-sm flex items-start justify-center pt-[10vh] p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos rápida"
      onClick={onClose}
    >
      <div
        className="glass-modal w-full max-w-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200/70 dark:border-white/10">
          <Search className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar lançamentos (ex: Giassi, 2731), contas, metas ou comandos..."
            aria-label="Buscar lançamentos, comandos e páginas"
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          {searching && (
            <span className="text-[10px] font-semibold text-blue-500 animate-pulse shrink-0">
              Buscando...
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar busca rápida"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[58vh] overflow-y-auto p-2 space-y-3">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">
              Nenhum comando encontrado para &quot;{query}&quot;.
            </p>
          ) : (
            groups.map((grp) => {
              const items = filtered.filter((c) => c.group === grp)
              if (items.length === 0) return null
              return (
                <div key={grp}>
                  <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {grp}
                  </p>
                  <ul className="space-y-0.5">
                    {items.map((item) => {
                      const idx = filtered.indexOf(item)
                      const active = idx === selectedIndex
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onMouseEnter={() => setSelectedIndex(idx)}
                            onClick={item.run}
                            className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition ${
                              active
                                ? 'bg-blue-600/12 dark:bg-blue-500/25 text-slate-950 dark:text-white'
                                : 'text-slate-700 dark:text-slate-200 hover:bg-white/40 dark:hover:bg-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="shrink-0">{item.icon}</span>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{item.label}</p>
                                {item.subtitle && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {item.subtitle}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {item.shortcut && (
                                <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-200/80 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                                  {item.shortcut}
                                </kbd>
                              )}
                              {active && <ArrowRight className="w-3.5 h-3.5 text-blue-500" aria-hidden="true" />}
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
            ↑↓ navegar · Enter abrir · Esc fechar
          </span>
          <span>Atalhos: Ctrl+K · Shift+P · ?</span>
        </div>
      </div>
    </div>
  )
}

export function ShortcutsHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  const shortcuts = [
    { keys: 'Ctrl + K / ⌘ + K', desc: 'Abrir busca rápida e comandos (Command Palette)' },
    { keys: 'Ctrl + I / ⌘ + I', desc: 'Abrir / fechar a Mony IA de qualquer tela' },
    { keys: 'N', desc: 'Criar novo lançamento no Dashboard' },
    { keys: 'Shift + P', desc: 'Alternar Modo Privacidade (ocultar todos os valores R$)' },
    { keys: 'Alt + ← / →', desc: 'Navegar para o mês anterior ou próximo mês' },
    { keys: 'Tab / Enter / Esc', desc: 'Avançar, salvar ou cancelar célula na planilha' },
    { keys: 'Ctrl + P', desc: 'Imprimir ou salvar relatório mensal em PDF limpo' },
    { keys: 'Shift + ?', desc: 'Abrir / fechar este guia de atalhos de teclado' },
  ]
  return (
    <div
      className="fixed inset-0 z-[65] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      onClick={onClose}
    >
      <div className="glass-modal max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 id="shortcuts-modal-title" className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-blue-500" aria-hidden="true" />
            Atalhos de Teclado
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar guia de atalhos"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <ul className="space-y-2.5">
          {shortcuts.map((s) => (
            <li
              key={s.keys}
              className="flex items-center justify-between gap-3 py-2 border-b border-slate-200/60 dark:border-white/10 last:border-0"
            >
              <span className="text-sm text-slate-700 dark:text-slate-200">{s.desc}</span>
              <kbd className="px-2 py-1 text-xs font-mono rounded-lg bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200 shrink-0">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

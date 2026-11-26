'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Wallet,
  BarChart3,
  PieChart,
  Sparkles,
  Target,
  Landmark,
  Palette,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Repeat,
  UserCircle,
  Table2,
  Calculator,
  TrendingUp,
  SlidersHorizontal,
  CreditCard,
  ShieldCheck,
  Calendar,
  Scale,
  Search,
  Eye,
  EyeOff,
  Keyboard,
} from 'lucide-react'
import { useAppearance } from '@/app/_theme/provider'
import { useAuth } from '@/stores/auth/useAuth'
import { MonyLogo } from '@/components/brand/MonyLogo'
import { MonyAIDrawer } from '@/components/ai/MonyAIDrawer'
import { NotificationBell } from '@/components/dashboard/NotificationBell'
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt'
import { CommandPalette, ShortcutsHelpModal } from '@/components/dashboard/CommandPalette'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface NavItem {
  href: string
  label: string
  testId: string
  icon: React.ReactNode
  badgeKey?: 'ai' | 'recurring' | 'openfinance'
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Visão Geral',
    items: [
      { href: '/dashboard', label: 'Dashboard', testId: 'nav-dashboard', icon: <LayoutDashboard className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
      { href: '/dashboard/cashflow', label: 'Cashflow', testId: 'nav-cashflow', icon: <Table2 className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
      { href: '/dashboard/calendar', label: 'Calendário', testId: 'nav-calendar', icon: <Calendar className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
      { href: '/dashboard/reports', label: 'Relatórios', testId: 'nav-reports', icon: <BarChart3 className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
    ],
  },
  {
    title: 'Dia a Dia',
    items: [
      { href: '/dashboard/accounts', label: 'Contas', testId: 'nav-accounts', icon: <Wallet className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
      { href: '/dashboard/cards', label: 'Cartões', testId: 'nav-cards', icon: <CreditCard className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
      { href: '/dashboard/recurring', label: 'Recorrentes', testId: 'nav-recurring', badgeKey: 'recurring', icon: <Repeat className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
      { href: '/dashboard/budgets', label: 'Budgets', testId: 'nav-budgets', icon: <PieChart className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
    ],
  },
  {
    title: 'Patrimônio & Futuro',
    items: [
      { href: '/dashboard/investments', label: 'Investimentos', testId: 'nav-investments', icon: <TrendingUp className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
      { href: '/dashboard/debts', label: 'Dívidas & Patrimônio', testId: 'nav-debts', icon: <Scale className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
      { href: '/dashboard/goals', label: 'Metas', testId: 'nav-goals', icon: <Target className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
      { href: '/dashboard/simulators', label: 'Simuladores', testId: 'nav-simulators', icon: <Calculator className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
    ],
  },
  {
    title: 'Inteligência IA',
    items: [
      { href: '/dashboard/ai-review', label: 'Revisão IA', testId: 'nav-ai-review', badgeKey: 'ai', icon: <ShieldCheck className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
      { href: '/dashboard/insights', label: 'Insights & Saúde', testId: 'nav-insights', icon: <Sparkles className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
      { href: '/dashboard/rules', label: 'Regras', testId: 'nav-rules', icon: <SlidersHorizontal className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
    ],
  },
]

const SECONDARY_ITEMS: NavItem[] = [
  { href: '/settings/profile', label: 'Perfil & 2FA', testId: 'nav-profile', icon: <UserCircle className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
  { href: '/settings/connections', label: 'Conexões', testId: 'nav-connections', badgeKey: 'openfinance', icon: <Landmark className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
  { href: '/settings/appearance', label: 'Aparência', testId: 'nav-appearance', icon: <Palette className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
]

const SIDEBAR_STORAGE_KEY = 'mony_sidebar_collapsed'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { settings, resolvedTheme, toggleDarkMode, togglePrivacyMode } = useAppearance()
  const { user, tokens, logout } = useAuth()
  const token = tokens?.access_token

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiTab, setAiTab] = useState<'chat' | 'import'>('chat')
  const [cmdOpen, setCmdOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [badges, setBadges] = useState<{ ai: number; recurring: number; openfinance: number }>({
    ai: 0,
    recurring: 0,
    openfinance: 0,
  })

  const fetchBadges = useCallback(async () => {
    if (!token) return
    try {
      const [aiRes, recRes, ofRes] = await Promise.all([
        fetch(`${API_URL}/ai/suggestions?status=pending`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
        fetch(`${API_URL}/recurring`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
        fetch(`${API_URL}/open-finance/pluggy/pending?status_filter=pending`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
      ])
      let aiCount = 0
      let recCount = 0
      let ofCount = 0
      if (aiRes && aiRes.ok) {
        const d = await aiRes.json()
        aiCount = Number(d?.total_pending ?? 0)
      }
      if (recRes && recRes.ok) {
        const d = await recRes.json()
        recCount = Number(d?.summary?.pending_this_month_count ?? 0)
      }
      if (ofRes && ofRes.ok) {
        const d = await ofRes.json()
        ofCount = Number(d?.pending_count ?? 0)
      }
      setBadges({ ai: aiCount, recurring: recCount, openfinance: ofCount })
    } catch {
      // silent badge fallback
    }
  }, [token])

  useEffect(() => {
    fetchBadges()
    const onUpdated = () => fetchBadges()
    window.addEventListener('mony:transactions-updated', onUpdated)
    return () => window.removeEventListener('mony:transactions-updated', onUpdated)
  }, [fetchBadges])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
      if (saved === 'true') setCollapsed(true)
      const params = new URLSearchParams(window.location.search)
      const aiParam = params.get('ai')
      if (aiParam === 'import' || aiParam === 'chat') {
        setAiTab(aiParam)
        setAiOpen(true)
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  // Global keyboard shortcuts: Ctrl/Cmd+K, Shift+P, Shift+?
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((prev) => !prev)
        return
      }
      if (inEditable) return

      if (e.shiftKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        togglePrivacyMode()
        dispatchToast(
          settings.privacyMode ? 'Modo Privacidade desativado' : 'Modo Privacidade ativado (valores ocultos)',
          'info'
        )
      } else if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setShortcutsOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settings.privacyMode, togglePrivacyMode])

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  const openAI = useCallback((tab: 'chat' | 'import') => {
    setAiTab(tab)
    setAiOpen(true)
  }, [])

  const isRouteActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : Boolean(pathname?.startsWith(href))

  const renderNavLink = (item: NavItem, isMobile = false) => {
    const active = isRouteActive(item.href)
    const iconOnly = collapsed && !isMobile
    const badgeCount = item.badgeKey ? badges[item.badgeKey] : 0

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          data-testid={isMobile ? undefined : item.testId}
          onClick={() => isMobile && setMobileOpen(false)}
          aria-current={active ? 'page' : undefined}
          aria-label={iconOnly ? item.label : undefined}
          title={iconOnly ? item.label : undefined}
          className={`group relative flex items-center rounded-2xl text-sm font-medium transition-all duration-200 ${
            iconOnly ? 'justify-center p-2.5' : 'justify-between gap-2 px-3 py-2'
          } ${
            active
              ? 'liquid-nav-active'
              : 'text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white hover:bg-white/45 dark:hover:bg-white/10'
          }`}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            {item.icon}
            {!iconOnly && <span className="truncate">{item.label}</span>}
          </span>
          {badgeCount > 0 && (
            <span
              className={`${
                iconOnly
                  ? 'absolute top-1 right-1 w-2 h-2 rounded-full bg-violet-500'
                  : 'px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-violet-600 text-white shrink-0'
              }`}
              aria-label={`${badgeCount} pendência(s)`}
            >
              {iconOnly ? '' : badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </Link>
      </li>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* Desktop Floating VisionOS Liquid Glass Sidebar */}
      <aside
        data-testid="dashboard-nav"
        aria-label="Navegação principal do dashboard"
        className={`hidden lg:flex flex-col fixed top-4 bottom-4 left-4 z-40 vision-sidebar transition-[width] duration-300 ease-out no-print ${
          collapsed ? 'w-[78px]' : 'w-64'
        }`}
      >
        {/* Brand + Collapse toggle */}
        <div
          className={`flex items-center px-3.5 pt-4 pb-3 ${
            collapsed ? 'flex-col gap-2.5' : 'justify-between'
          }`}
        >
          <Link
            href="/dashboard"
            aria-label="Mony — Ir para o Dashboard"
            className="flex items-center min-w-0"
          >
            <MonyLogo size="sm" showWordmark={!collapsed} />
          </Link>

          <button
            type="button"
            onClick={toggleCollapse}
            data-testid="sidebar-collapse-toggle"
            aria-label={collapsed ? 'Expandir barra lateral' : 'Recuar barra lateral'}
            title={collapsed ? 'Expandir menu' : 'Recuar menu'}
            className="liquid-btn liquid-btn-glass p-2 rounded-xl text-slate-600 dark:text-slate-300 shrink-0"
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Grouped Primary Navigation */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-2 space-y-4" aria-label="Menu principal">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {group.title}
                </p>
              )}
              <ul className="space-y-0.5">{group.items.map((item) => renderNavLink(item))}</ul>
            </div>
          ))}

          <div className="border-t border-white/45 dark:border-white/10 mx-2" />

          {/* Secondary / Settings group */}
          <ul className="space-y-0.5">
            {SECONDARY_ITEMS.map((item) => renderNavLink(item))}

            <li>
              <button
                type="button"
                onClick={toggleDarkMode}
                data-testid="theme-toggle"
                aria-label={
                  resolvedTheme === 'dark' ? 'Alternar para modo claro' : 'Alternar para modo escuro'
                }
                title={collapsed ? (resolvedTheme === 'dark' ? 'Modo claro' : 'Modo escuro') : undefined}
                className={`w-full flex items-center rounded-2xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-white/45 dark:hover:bg-white/10 transition-all ${
                  collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                }`}
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="w-[18px] h-[18px] text-amber-400 shrink-0" aria-hidden="true" />
                ) : (
                  <Moon className="w-[18px] h-[18px] text-slate-700 shrink-0" aria-hidden="true" />
                )}
                {!collapsed && (
                  <span className="truncate">
                    {resolvedTheme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                  </span>
                )}
              </button>
            </li>
          </ul>
        </nav>

        {/* Bottom User, PWA Install & Logout */}
        <div className="p-2.5 border-t border-white/45 dark:border-white/10 space-y-1.5">
          <PwaInstallPrompt collapsed={collapsed} />
          {!collapsed && user?.full_name && (
            <Link
              href="/settings/profile"
              className="block px-3 py-1.5 rounded-xl bg-white/40 dark:bg-white/5 hover:bg-white/65 dark:hover:bg-white/10 transition text-xs"
            >
              <p className="font-semibold text-slate-900 dark:text-white truncate">{user.full_name}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Plano {user.plan || 'BASIC'} · Perfil
              </p>
            </Link>
          )}
          <button
            type="button"
            onClick={logout}
            data-testid="nav-logout"
            aria-label="Sair da conta"
            title={collapsed ? 'Sair da conta' : undefined}
            className={`w-full flex items-center rounded-2xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/30 transition-all ${
              collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
            }`}
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-300 ease-out ${
          collapsed ? 'lg:pl-[102px]' : 'lg:pl-[284px]'
        }`}
      >
        {/* Top Floating Action Bar */}
        <header className="sticky top-0 z-30 px-4 sm:px-6 lg:px-8 pt-4 pb-2 no-print">
          <div className="max-w-7xl mx-auto glass-chrome rounded-2xl px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
            {/* Left: Mobile menu + Command Palette trigger */}
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="liquid-btn liquid-btn-glass lg:hidden p-2 rounded-xl"
                aria-label="Abrir menu de navegação"
                aria-expanded={mobileOpen}
              >
                <Menu className="w-5 h-5" aria-hidden="true" />
              </button>
              <Link href="/dashboard" className="lg:hidden">
                <MonyLogo size="sm" showWordmark />
              </Link>

              <button
                type="button"
                onClick={() => setCmdOpen(true)}
                data-testid="open-command-palette"
                aria-label="Abrir busca rápida e comandos (Ctrl+K)"
                className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/50 dark:bg-white/10 hover:bg-white/75 dark:hover:bg-white/15 border border-white/60 dark:border-white/15 text-xs text-slate-600 dark:text-slate-300 transition"
              >
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden md:inline">Buscar tela ou ação...</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-slate-200/80 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                  Ctrl+K
                </kbd>
              </button>
            </div>

            {/* Right: Privacy + Shortcuts + Bell + Import + AI */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  togglePrivacyMode()
                  dispatchToast(
                    settings.privacyMode ? 'Valores visíveis novamente' : 'Modo Privacidade ativado',
                    'info'
                  )
                }}
                data-testid="privacy-toggle"
                aria-pressed={settings.privacyMode}
                aria-label={settings.privacyMode ? 'Mostrar valores R$' : 'Ocultar valores R$ (Modo Privacidade)'}
                title="Modo Privacidade (Shift+P)"
                className={`liquid-btn liquid-btn-glass p-2 rounded-xl transition ${
                  settings.privacyMode
                    ? 'text-amber-600 dark:text-amber-400 ring-1 ring-amber-400/50'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {settings.privacyMode ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                aria-label="Atalhos de teclado"
                title="Atalhos de teclado (?)"
                className="hidden md:inline-flex liquid-btn liquid-btn-glass p-2 rounded-xl text-slate-600 dark:text-slate-300"
              >
                <Keyboard className="w-4 h-4" aria-hidden="true" />
              </button>

              <NotificationBell />

              <button
                type="button"
                onClick={() => openAI('import')}
                data-testid="open-ai-import"
                className="liquid-btn liquid-btn-glass inline-flex items-center gap-2 px-2.5 sm:px-3.5 py-2 rounded-full text-xs sm:text-sm font-medium"
                title="Anexar fatura, extrato, boleto ou PIX para análise automática"
              >
                <Paperclip className="w-4 h-4 text-primary-600" aria-hidden="true" />
                <span className="hidden sm:inline">Importar</span>
              </button>

              <button
                type="button"
                onClick={() => openAI('chat')}
                data-testid="open-ai-chat"
                className="liquid-btn liquid-btn-primary inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                <span>Mony IA</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content (padded bottom for mobile nav bar) */}
        <main id="main-content" className="flex-1 pb-24 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Native Mobile Bottom Navigation Bar (PWA) */}
      <nav
        aria-label="Navegação rápida móvel"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-3 pt-1 no-print pointer-events-none"
      >
        <div className="pointer-events-auto glass-chrome rounded-2xl px-2 py-1.5 grid grid-cols-5 items-center shadow-xl border border-white/60 dark:border-white/15">
          <Link
            href="/dashboard"
            className={`flex flex-col items-center gap-0.5 py-1 rounded-xl text-[10px] font-semibold ${
              pathname === '/dashboard' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" aria-hidden="true" />
            <span>Início</span>
          </Link>
          <Link
            href="/dashboard/cashflow"
            className={`flex flex-col items-center gap-0.5 py-1 rounded-xl text-[10px] font-semibold ${
              pathname?.startsWith('/dashboard/cashflow') ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Table2 className="w-5 h-5" aria-hidden="true" />
            <span>Planilha</span>
          </Link>
          <button
            type="button"
            onClick={() => openAI('chat')}
            aria-label="Abrir Mony IA e lançamento por voz"
            className="flex flex-col items-center justify-center -mt-5"
          >
            <span
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg"
              style={{ background: 'var(--accent)' }}
            >
              <Sparkles className="w-5 h-5" aria-hidden="true" />
            </span>
            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 mt-0.5">IA</span>
          </button>
          <Link
            href="/dashboard/calendar"
            className={`flex flex-col items-center gap-0.5 py-1 rounded-xl text-[10px] font-semibold ${
              pathname?.startsWith('/dashboard/calendar') ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Calendar className="w-5 h-5" aria-hidden="true" />
            <span>Agenda</span>
          </Link>
          <Link
            href="/dashboard/ai-review"
            className={`relative flex flex-col items-center gap-0.5 py-1 rounded-xl text-[10px] font-semibold ${
              pathname?.startsWith('/dashboard/ai-review') ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            <span>Revisão</span>
            {badges.ai > 0 && (
              <span className="absolute top-0.5 right-3 w-2 h-2 rounded-full bg-violet-600" />
            )}
          </Link>
        </div>
      </nav>

      {/* Mobile Drawer Sidebar */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-slate-950/45 backdrop-blur-sm flex"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação móvel"
        >
          <div className="vision-sidebar w-72 max-w-[85vw] m-3 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/40 dark:border-white/10">
              <MonyLogo size="sm" showWordmark />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
              {NAV_GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {group.title}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => renderNavLink(item, true))}
                  </ul>
                </div>
              ))}
              <div className="border-t border-white/40 dark:border-white/10" />
              <ul className="space-y-0.5">
                {SECONDARY_ITEMS.map((item) => renderNavLink(item, true))}
                <li>
                  <button
                    type="button"
                    onClick={toggleDarkMode}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-white/45 dark:hover:bg-white/10"
                  >
                    {resolvedTheme === 'dark' ? (
                      <Sun className="w-[18px] h-[18px] text-amber-400" aria-hidden="true" />
                    ) : (
                      <Moon className="w-[18px] h-[18px]" aria-hidden="true" />
                    )}
                    <span>{resolvedTheme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
                  </button>
                </li>
              </ul>
            </nav>

            <div className="p-3 border-t border-white/40 dark:border-white/10">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false)
                  logout()
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/30"
              >
                <LogOut className="w-[18px] h-[18px]" aria-hidden="true" />
                <span>Sair da conta</span>
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileOpen(false)} aria-hidden="true" />
        </div>
      )}

      {/* Global Command Palette, Keyboard Shortcuts & Mony IA Drawer */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onOpenAI={openAI} />
      <ShortcutsHelpModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <MonyAIDrawer open={aiOpen} initialTab={aiTab} onClose={() => setAiOpen(false)} />
    </div>
  )
}

/** Backwards-compatible alias for any imports referencing DashboardNav */
export function DashboardNav() {
  return null
}

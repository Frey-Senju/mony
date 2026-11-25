'use client'

import React, { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { useAppearance } from '@/app/_theme/provider'
import { useAuth } from '@/stores/auth/useAuth'
import { MonyLogo } from '@/components/brand/MonyLogo'
import { MonyAIDrawer } from '@/components/ai/MonyAIDrawer'
import { NotificationBell } from '@/components/dashboard/NotificationBell'
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt'

interface NavItem {
  href: string
  label: string
  testId: string
  icon: React.ReactNode
}

const PRIMARY_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', testId: 'nav-dashboard', icon: <LayoutDashboard className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
  { href: '/dashboard/cashflow', label: 'Cashflow', testId: 'nav-cashflow', icon: <Table2 className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
  { href: '/dashboard/investments', label: 'Investimentos', testId: 'nav-investments', icon: <TrendingUp className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
  { href: '/dashboard/simulators', label: 'Simuladores', testId: 'nav-simulators', icon: <Calculator className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
  { href: '/dashboard/accounts', label: 'Contas', testId: 'nav-accounts', icon: <Wallet className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
  { href: '/dashboard/recurring', label: 'Recorrentes', testId: 'nav-recurring', icon: <Repeat className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
  { href: '/dashboard/reports', label: 'Relatórios', testId: 'nav-reports', icon: <BarChart3 className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
  { href: '/dashboard/budgets', label: 'Budgets', testId: 'nav-budgets', icon: <PieChart className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
  { href: '/dashboard/insights', label: 'Insights', testId: 'nav-insights', icon: <Sparkles className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
  { href: '/dashboard/goals', label: 'Metas', testId: 'nav-goals', icon: <Target className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
]

const SECONDARY_ITEMS: NavItem[] = [
  { href: '/settings/profile', label: 'Perfil & 2FA', testId: 'nav-profile', icon: <UserCircle className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
  { href: '/settings/connections', label: 'Conexões', testId: 'nav-connections', icon: <Landmark className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
  { href: '/settings/appearance', label: 'Aparência', testId: 'nav-appearance', icon: <Palette className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> },
]

const SIDEBAR_STORAGE_KEY = 'mony_sidebar_collapsed'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { resolvedTheme, toggleDarkMode } = useAppearance()
  const { user, logout } = useAuth()

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiTab, setAiTab] = useState<'chat' | 'import'>('chat')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
      if (saved === 'true') setCollapsed(true)
      // Support PWA home-screen shortcut `/dashboard?ai=import`
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

  const openAI = (tab: 'chat' | 'import') => {
    setAiTab(tab)
    setAiOpen(true)
  }

  const isRouteActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : Boolean(pathname?.startsWith(href))

  const renderNavLink = (item: NavItem, isMobile = false) => {
    const active = isRouteActive(item.href)
    const iconOnly = collapsed && !isMobile

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
            iconOnly ? 'justify-center p-3' : 'gap-3 px-3.5 py-2.5'
          } ${
            active
              ? 'liquid-nav-active'
              : 'text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white hover:bg-white/45 dark:hover:bg-white/10'
          }`}
        >
          {item.icon}
          {!iconOnly && <span className="truncate">{item.label}</span>}
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

        {/* Primary navigation */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-2 space-y-5" aria-label="Menu principal">
          <ul className="space-y-1">{PRIMARY_ITEMS.map((item) => renderNavLink(item))}</ul>

          <div className="border-t border-white/45 dark:border-white/10 mx-2" />

          {/* Secondary / Settings group (VisionOS style) */}
          <ul className="space-y-1">
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
                  collapsed ? 'justify-center p-3' : 'gap-3 px-3.5 py-2.5'
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
              collapsed ? 'justify-center p-3' : 'gap-3 px-3.5 py-2.5'
            }`}
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area (shifts smoothly with sidebar width) */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-300 ease-out ${
          collapsed ? 'lg:pl-[102px]' : 'lg:pl-[284px]'
        }`}
      >
        {/* Top Floating Action Bar with AI Assistant & File Import */}
        <header className="sticky top-0 z-30 px-4 sm:px-6 lg:px-8 pt-4 pb-2 no-print">
          <div className="max-w-7xl mx-auto glass-chrome rounded-2xl px-3.5 sm:px-5 h-14 flex items-center justify-between gap-3">
            {/* Left: Mobile menu + logo */}
            <div className="flex items-center gap-2.5">
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
              <span className="hidden lg:inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                Mony · Liquid Glass Workspace
              </span>
            </div>

            {/* Right: Alerts Bell + "Importar Fatura" & "Falar com a IA" pills (VisionOS top actions) */}
            <div className="flex items-center gap-2">
              <NotificationBell />

              <button
                type="button"
                onClick={() => openAI('import')}
                data-testid="open-ai-import"
                className="liquid-btn liquid-btn-glass inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium"
                title="Anexar fatura, extrato, boleto ou PIX para análise automática"
              >
                <Paperclip className="w-4 h-4 text-primary-600" aria-hidden="true" />
                <span className="hidden sm:inline">Importar Fatura</span>
              </button>

              <button
                type="button"
                onClick={() => openAI('chat')}
                data-testid="open-ai-chat"
                className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                <span>Falar com a IA</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main id="main-content" className="flex-1">
          {children}
        </main>
      </div>

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
              <ul className="space-y-1">
                {PRIMARY_ITEMS.map((item) => renderNavLink(item, true))}
              </ul>
              <div className="border-t border-white/40 dark:border-white/10" />
              <ul className="space-y-1">
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

      {/* Global Mony IA Assistant & Document Analyzer Drawer */}
      <MonyAIDrawer open={aiOpen} initialTab={aiTab} onClose={() => setAiOpen(false)} />
    </div>
  )
}

/** Backwards-compatible alias for any imports referencing DashboardNav */
export function DashboardNav() {
  return null
}

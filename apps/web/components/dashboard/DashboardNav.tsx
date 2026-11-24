'use client'

import React, { useState } from 'react'
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
} from 'lucide-react'
import { useAppearance } from '@/app/_theme/provider'
import { useAuth } from '@/stores/auth/useAuth'

interface NavItem {
  href: string
  label: string
  testId: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', testId: 'nav-dashboard', icon: <LayoutDashboard className="w-4 h-4" aria-hidden="true" /> },
  { href: '/dashboard/accounts', label: 'Contas', testId: 'nav-accounts', icon: <Wallet className="w-4 h-4" aria-hidden="true" /> },
  { href: '/dashboard/reports', label: 'Relatórios', testId: 'nav-reports', icon: <BarChart3 className="w-4 h-4" aria-hidden="true" /> },
  { href: '/dashboard/budgets', label: 'Budgets', testId: 'nav-budgets', icon: <PieChart className="w-4 h-4" aria-hidden="true" /> },
  { href: '/dashboard/insights', label: 'Insights', testId: 'nav-insights', icon: <Sparkles className="w-4 h-4" aria-hidden="true" /> },
  { href: '/dashboard/goals', label: 'Metas', testId: 'nav-goals', icon: <Target className="w-4 h-4" aria-hidden="true" /> },
  { href: '/settings/connections', label: 'Conexões', testId: 'nav-connections', icon: <Landmark className="w-4 h-4" aria-hidden="true" /> },
  { href: '/settings/appearance', label: 'Aparência', testId: 'nav-appearance', icon: <Palette className="w-4 h-4" aria-hidden="true" /> },
]

export function DashboardNav() {
  const pathname = usePathname()
  const { resolvedTheme, toggleDarkMode } = useAppearance()
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isRouteActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : Boolean(pathname?.startsWith(href))

  return (
    <nav
      className="glass-chrome sticky top-0 z-40"
      data-testid="dashboard-nav"
      aria-label="Navegação principal do dashboard"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Brand */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 font-bold text-lg tracking-tight text-slate-900 dark:text-white shrink-0"
            aria-label="Mony — Ir para o Dashboard"
          >
            <span
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-extrabold shadow-sm"
              style={{ background: 'var(--accent)' }}
              aria-hidden="true"
            >
              M
            </span>
            <span>Mony</span>
          </Link>

          {/* Desktop nav links */}
          <ul className="hidden lg:flex items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const active = isRouteActive(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-testid={item.testId}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                      active
                        ? 'liquid-nav-active'
                        : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/10'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>

          {/* Right actions */}
          <div className="flex items-center gap-2 shrink-0">
            {user?.full_name && (
              <span className="hidden xl:inline-block text-xs font-medium text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-full bg-white/50 dark:bg-white/10 border border-white/60 dark:border-white/15">
                {user.full_name}
              </span>
            )}

            <button
              type="button"
              onClick={toggleDarkMode}
              className="liquid-btn liquid-btn-glass p-2 rounded-xl"
              aria-label={resolvedTheme === 'dark' ? 'Alternar para modo claro' : 'Alternar para modo escuro'}
              title={resolvedTheme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              data-testid="theme-toggle"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={logout}
              className="liquid-btn liquid-btn-glass hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-red-600 dark:hover:text-red-400"
              aria-label="Sair da conta"
              data-testid="nav-logout"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>Sair</span>
            </button>

            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="liquid-btn liquid-btn-glass lg:hidden p-2 rounded-xl"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-menu"
              aria-label={mobileOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
            >
              {mobileOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Mobile menu drawer */}
        {mobileOpen && (
          <div
            id="mobile-nav-menu"
            className="lg:hidden pb-4 pt-2 border-t border-white/40 dark:border-white/10"
          >
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {NAV_ITEMS.map((item) => {
                const active = isRouteActive(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        active
                          ? 'liquid-nav-active'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-white/50 dark:hover:bg-white/10'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  </li>
                )
              })}
              <li className="sm:hidden col-span-2 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false)
                    logout()
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-950/30"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  <span>Sair da conta</span>
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>
    </nav>
  )
}

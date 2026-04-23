'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * DashboardNav — thin top-nav shared across all /dashboard/* routes.
 * Provides navigation between the main dashboard and feature pages
 * (Reports, etc.). Added in Story 1.6 to satisfy AC8 ("Reports page is
 * accessible from the dashboard navigation").
 */

interface NavItem {
  href: string
  label: string
  testId: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', testId: 'nav-dashboard' },
  { href: '/dashboard/reports', label: 'Relatórios', testId: 'nav-reports' },
]

export function DashboardNav() {
  const pathname = usePathname()

  return (
    <nav
      className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800"
      data-testid="dashboard-nav"
      aria-label="Navegação principal do dashboard"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ul className="flex items-center gap-1 h-12">
          {NAV_ITEMS.map((item) => {
            // Exact match for /dashboard (root), prefix match for subroutes.
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname?.startsWith(item.href)

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-testid={item.testId}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}

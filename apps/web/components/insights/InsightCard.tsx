'use client'

import React from 'react'

interface InsightCardProps {
  title: string
  icon: React.ReactNode
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple'
  children: React.ReactNode
  loading?: boolean
}

const COLORS = {
  blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  yellow: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
}

const ICON_COLORS = {
  blue: 'text-blue-600 dark:text-blue-400',
  green: 'text-green-600 dark:text-green-400',
  red: 'text-red-600 dark:text-red-400',
  yellow: 'text-yellow-600 dark:text-yellow-400',
  purple: 'text-purple-600 dark:text-purple-400',
}

export function InsightCard({ title, icon, color, children, loading }: InsightCardProps) {
  if (loading) {
    return <div className="h-36 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
  }
  return (
    <div className={`border rounded-lg p-5 ${COLORS[color]}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={ICON_COLORS[color]}>{icon}</span>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
      </div>
      {children}
    </div>
  )
}

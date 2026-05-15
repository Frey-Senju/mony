'use client'

import React from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Anomaly } from '@/lib/api/insights'

interface AnomalyAlertProps {
  anomalies: Anomaly[]
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function AnomalyAlert({ anomalies }: AnomalyAlertProps) {
  if (anomalies.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Nenhuma anomalia detectada — seus gastos estão dentro do padrão.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {anomalies.map((a) => (
        <li key={a.category} className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-medium text-slate-800 dark:text-slate-200">{a.category}</span>
            <span className="text-slate-600 dark:text-slate-400">
              {' '}— {formatBRL(Number(a.current_month))} este mês
              {' '}({Number(a.ratio).toFixed(1)}× da média de {formatBRL(Number(a.avg_3m))})
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

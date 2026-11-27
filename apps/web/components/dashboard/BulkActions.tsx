'use client'

import React, { useState } from 'react'
import { Archive, Calendar, Tag, Trash2, Download, X, ChevronDown } from 'lucide-react'

export interface BulkActionsProps {
  selectedCount: number
  selectedSum?: number
  selectedAvg?: number
  onArchive: () => void
  onCategorize: () => void
  onChangeMonth?: () => void
  onDelete: () => void
  onExport: (format: 'csv' | 'json' | 'html') => void
  onClearSelection: () => void
  loading?: boolean
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

export function BulkActions({
  selectedCount,
  selectedSum,
  selectedAvg,
  onArchive,
  onCategorize,
  onChangeMonth,
  onDelete,
  onExport,
  onClearSelection,
  loading = false,
}: BulkActionsProps) {
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)

  const handleExportClick = (format: 'csv' | 'json' | 'html') => {
    onExport(format)
    setIsExportMenuOpen(false)
  }

  if (selectedCount === 0) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-2rem)] max-w-5xl glass-modal border border-blue-400/35 shadow-2xl px-4 py-3 no-print">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center flex-wrap gap-3">
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            {selectedCount} selecionado{selectedCount !== 1 ? '(s)' : ''}
          </span>
          {typeof selectedSum === 'number' && (
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/12 text-blue-700 dark:text-blue-300 border border-blue-500/25 tabular-nums money-value">
              <span>Soma: {brl(selectedSum)}</span>
              {typeof selectedAvg === 'number' && selectedCount > 1 && (
                <span className="opacity-80">· Média: {brl(selectedAvg)}</span>
              )}
            </span>
          )}
          <button
            type="button"
            onClick={onClearSelection}
            className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white underline"
          >
            Desselecionar tudo
          </button>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={onArchive}
            disabled={loading}
            className="liquid-btn liquid-btn-glass flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50"
            title="Marcar selecionados como pagos / arquivar"
          >
            <Archive className="w-3.5 h-3.5" />
            Arquivar
          </button>

          <button
            type="button"
            onClick={onCategorize}
            disabled={loading}
            className="liquid-btn liquid-btn-glass flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50"
            title="Categorizar selecionados"
          >
            <Tag className="w-3.5 h-3.5" />
            Categorizar
          </button>

          {onChangeMonth && (
            <button
              type="button"
              onClick={onChangeMonth}
              disabled={loading}
              className="liquid-btn liquid-btn-glass flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-600 dark:text-blue-400 disabled:opacity-50"
              title="Mover selecionados para outro mês de fatura/competência"
            >
              <Calendar className="w-3.5 h-3.5" />
              Mover Mês
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              disabled={loading}
              className="liquid-btn liquid-btn-glass flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50"
              title="Exportar selecionados"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar
              <ChevronDown className="w-3 h-3" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-40 glass-modal rounded-xl shadow-xl z-20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleExportClick('csv')}
                  className="w-full text-left px-4 py-2 hover:bg-white/60 dark:hover:bg-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  📄 CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleExportClick('json')}
                  className="w-full text-left px-4 py-2 hover:bg-white/60 dark:hover:bg-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors border-t border-white/40 dark:border-white/10"
                >
                  🔷 JSON
                </button>
                <button
                  type="button"
                  onClick={() => handleExportClick('html')}
                  className="w-full text-left px-4 py-2 hover:bg-white/60 dark:hover:bg-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors border-t border-white/40 dark:border-white/10"
                >
                  🌐 HTML
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onDelete}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-400/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 transition-colors text-xs font-semibold"
            title="Deletar selecionados"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Deletar
          </button>

          <button
            type="button"
            onClick={onClearSelection}
            disabled={loading}
            className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/10 transition"
            title="Fechar"
            aria-label="Fechar barra de seleção"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading && (
        <div className="mt-2.5 h-1 bg-slate-200/70 dark:bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 animate-pulse w-1/3" />
        </div>
      )}
    </div>
  )
}

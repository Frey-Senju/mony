'use client'

import React from 'react'
import { Archive, Tag, Trash2, Download, X } from 'lucide-react'

interface BulkActionsProps {
  selectedCount: number
  onArchive: () => void
  onCategorize: () => void
  onDelete: () => void
  onExport: () => void
  onClearSelection: () => void
  loading?: boolean
}

export function BulkActions({
  selectedCount,
  onArchive,
  onCategorize,
  onDelete,
  onExport,
  onClearSelection,
  loading = false,
}: BulkActionsProps) {
  if (selectedCount === 0) {
    return null
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {selectedCount} selecionado{selectedCount !== 1 ? '(s)' : ''}
            </span>
            <button
              onClick={onClearSelection}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Desselecionar tudo
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onArchive}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              title="Arquivar selecionados"
            >
              <Archive className="w-4 h-4" />
              Arquivar
            </button>

            <button
              onClick={onCategorize}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              title="Categorizar selecionados"
            >
              <Tag className="w-4 h-4" />
              Categorizar
            </button>

            <button
              onClick={onExport}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              title="Exportar selecionados"
            >
              <Download className="w-4 h-4" />
              Exportar
            </button>

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />

            <button
              onClick={onDelete}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              title="Deletar selecionados"
            >
              <Trash2 className="w-4 h-4" />
              Deletar
            </button>

            <button
              onClick={onClearSelection}
              disabled={loading}
              className="flex items-center justify-center p-2 rounded border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {loading && (
          <div className="mt-3 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 animate-pulse" style={{ width: '30%' }} />
          </div>
        )}
      </div>
    </div>
  )
}

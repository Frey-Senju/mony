'use client'

import React from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { MonyLogo } from '@/components/brand/MonyLogo'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-panel max-w-md w-full p-8 text-center space-y-5">
        <div className="flex justify-center">
          <MonyLogo size="md" showWordmark />
        </div>
        <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Ops! Algo saiu do esperado
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {error?.message || 'Ocorreu um erro temporário ao renderizar esta tela.'}
          </p>
        </div>
        <div className="flex justify-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={reset}
            className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Tentar novamente
          </button>
          <Link
            href="/dashboard"
            className="liquid-btn liquid-btn-glass px-4 py-2.5 rounded-xl text-sm font-medium"
          >
            Início
          </Link>
        </div>
      </div>
    </main>
  )
}

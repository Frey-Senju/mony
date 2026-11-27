'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, RotateCcw, X } from 'lucide-react'

export type ToastVariant = 'success' | 'error' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
}

export interface ToastOptions {
  action?: ToastAction
  durationMs?: number
}

export interface ToastItem {
  id: string
  message: string
  variant: ToastVariant
  action?: ToastAction
}

interface ToastContextValue {
  notify: (message: string, variant?: ToastVariant, options?: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue>({
  notify: () => undefined,
})

export function dispatchToast(
  message: string,
  variant: ToastVariant = 'info',
  options?: ToastOptions
) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('mony:toast', {
      detail: { message, variant, action: options?.action, durationMs: options?.durationMs },
    })
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const notify = useCallback(
    (message: string, variant: ToastVariant = 'info', options?: ToastOptions) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const duration = options?.durationMs ?? (options?.action ? 6500 : 4500)
      setToasts((prev) => [...prev.slice(-3), { id, message, variant, action: options?.action }])
      setTimeout(() => dismiss(id), duration)
    },
    [dismiss]
  )

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          message?: string
          variant?: ToastVariant
          action?: ToastAction
          durationMs?: number
        }>
      ).detail
      if (detail?.message) {
        notify(detail.message, detail.variant || 'info', {
          action: detail.action,
          durationMs: detail.durationMs,
        })
      }
    }
    window.addEventListener('mony:toast', onToast)
    return () => window.removeEventListener('mony:toast', onToast)
  }, [notify])

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-20 lg:bottom-6 right-4 z-[70] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none no-print"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.variant === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto glass-modal px-4 py-3 flex items-center gap-2.5 text-sm shadow-xl border ${
              t.variant === 'success'
                ? 'border-emerald-400/50 text-emerald-900 dark:text-emerald-100'
                : t.variant === 'error'
                ? 'border-rose-400/60 text-rose-900 dark:text-rose-100'
                : 'border-blue-400/40 text-slate-900 dark:text-slate-100'
            }`}
          >
            {t.variant === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            ) : t.variant === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true" />
            ) : (
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
            )}
            <span className="flex-1 leading-snug">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={async () => {
                  const fn = t.action?.onClick
                  dismiss(t.id)
                  if (fn) await fn()
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition shrink-0"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Fechar notificação"
              className="p-0.5 rounded-lg opacity-60 hover:opacity-100 shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

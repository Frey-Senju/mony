'use client'

import React, { useEffect, useState } from 'react'
import { Download, Smartphone, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface PwaInstallPromptProps {
  collapsed?: boolean
}

export function PwaInstallPrompt({ collapsed = false }: PwaInstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Register lightweight PWA service worker
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      Boolean((window.navigator as unknown as { standalone?: boolean }).standalone)
    setIsStandalone(standalone)

    const ua = window.navigator.userAgent || ''
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream)

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferredPrompt(null)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (isStandalone) return null
  if (!deferredPrompt && !isIOS) return null

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null)
      }
    } else if (isIOS) {
      setShowIosHint((v) => !v)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleInstall}
        title={collapsed ? 'Instalar Mony no celular/desktop' : undefined}
        aria-label="Instalar aplicativo Mony"
        className={`w-full flex items-center rounded-2xl text-sm font-medium transition-all ${
          collapsed ? 'justify-center p-3' : 'gap-3 px-3.5 py-2.5'
        } text-slate-700 dark:text-slate-200 hover:bg-white/55 dark:hover:bg-white/10`}
      >
        {isIOS ? (
          <Smartphone className="w-[18px] h-[18px] shrink-0" style={{ color: 'var(--accent)' }} aria-hidden="true" />
        ) : (
          <Download className="w-[18px] h-[18px] shrink-0" style={{ color: 'var(--accent)' }} aria-hidden="true" />
        )}
        {!collapsed && <span className="truncate">Instalar App</span>}
      </button>

      {showIosHint && (
        <div
          role="dialog"
          aria-label="Como instalar no iPhone"
          className="glass-modal absolute bottom-12 left-0 w-64 p-3.5 rounded-2xl text-xs space-y-1.5 z-50"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900 dark:text-white">Instalar no iPhone / iPad</span>
            <button
              type="button"
              onClick={() => setShowIosHint(false)}
              aria-label="Fechar dica"
              className="p-0.5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            No Safari, toque em <strong>Compartilhar</strong> (ícone de seta para cima) e depois em{' '}
            <strong>Adicionar à Tela de Início</strong>.
          </p>
        </div>
      )}
    </div>
  )
}

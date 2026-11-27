'use client'

import React, { useRef, useState } from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface SpeechRecognitionEventLike {
  results: {
    [index: number]: {
      [index: number]: { transcript: string }
    }
  }
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

export function VoiceQuickEntryButton({
  token,
  onCreated,
  compact = false,
}: {
  token?: string
  onCreated?: () => void
  compact?: boolean
}) {
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)

  const submitTranscript = async (transcript: string) => {
    if (!token || !transcript.trim()) return
    setProcessing(true)
    try {
      const res = await fetch(`${API_URL}/integrations/nl-entry`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: transcript.trim(), source_tag: '#voz' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Não foi possível processar comando de voz.')

      if (data.intent === 'create_tx' && data.transaction?.id) {
        const txId = data.transaction.id as string
        dispatchToast(data.reply || 'Lançamento por voz criado!', 'success', {
          durationMs: 7000,
          action: {
            label: 'Desfazer',
            onClick: async () => {
              await fetch(`${API_URL}/transactions/${txId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              }).catch(() => undefined)
              window.dispatchEvent(new Event('mony:transactions-updated'))
              dispatchToast('Lançamento por voz desfeito.', 'info')
            },
          },
        })
        window.dispatchEvent(new Event('mony:transactions-updated'))
        onCreated?.()
      } else {
        dispatchToast(data.reply || 'Comando processado.', 'info', { durationMs: 6000 })
      }
    } catch (err) {
      dispatchToast(err instanceof Error ? err.message : 'Erro no lançamento por voz', 'error')
    } finally {
      setProcessing(false)
    }
  }

  const toggleVoice = () => {
    if (!token) return
    if (listening) {
      recRef.current?.stop()
      setListening(false)
      return
    }

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Ctor) {
      const fallback = window.prompt('Fale/digite seu lançamento (ex: "Gastei 45 no mercado no pix"):')
      if (fallback) submitTranscript(fallback)
      return
    }

    const rec = new Ctor()
    rec.lang = 'pt-BR'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (ev) => {
      const transcript = ev.results?.[0]?.[0]?.transcript || ''
      setListening(false)
      if (transcript) {
        dispatchToast(`🎙️ "${transcript}"`, 'info', { durationMs: 2500 })
        submitTranscript(transcript)
      }
    }
    rec.onerror = () => {
      setListening(false)
      dispatchToast('Não foi possível capturar o áudio. Verifique a permissão do microfone.', 'error')
    }
    rec.onend = () => {
      setListening(false)
    }
    recRef.current = rec
    setListening(true)
    rec.start()
  }

  return (
    <button
      type="button"
      onClick={toggleVoice}
      disabled={processing}
      title='Lançamento por voz (ex: "Gastei 48 reais no Uber no pix")'
      aria-label="Lançamento por voz"
      className={`no-print liquid-btn inline-flex items-center gap-1.5 rounded-xl text-xs font-semibold transition ${
        listening
          ? 'bg-rose-600 text-white animate-pulse px-3 py-2.5 shadow-lg'
          : 'liquid-btn-glass text-violet-700 dark:text-violet-300 px-3 py-2.5'
      }`}
    >
      {processing ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : listening ? (
        <MicOff className="w-4 h-4" aria-hidden="true" />
      ) : (
        <Mic className="w-4 h-4" aria-hidden="true" />
      )}
      {!compact && <span className="hidden xl:inline">{listening ? 'Ouvindo...' : 'Voz'}</span>}
    </button>
  )
}

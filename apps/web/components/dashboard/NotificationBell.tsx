'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Bell,
  AlertTriangle,
  Calendar,
  Trophy,
  CheckCheck,
  X,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/stores/auth/useAuth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  related_entity_type?: string | null
  related_entity_id?: string | null
  is_read: boolean
  created_at?: string | null
}

export function NotificationBell() {
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setUnread(data.unread_count || 0)
      }
    } catch {
      // ignore transient network errors
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    const onRefresh = () => fetchNotifications()
    window.addEventListener('mony:transactions-updated', onRefresh)
    return () => window.removeEventListener('mony:transactions-updated', onRefresh)
  }, [fetchNotifications])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  const markRead = async (id: string) => {
    if (!token) return
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    setUnread((u) => Math.max(0, u - 1))
    await fetch(`${API_URL}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined)
  }

  const markAllRead = async () => {
    if (!token || unread === 0) return
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnread(0)
    await fetch(`${API_URL}/notifications/mark-all-read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined)
  }

  const dismiss = async (id: string, wasUnread: boolean) => {
    if (!token) return
    setItems((prev) => prev.filter((n) => n.id !== id))
    if (wasUnread) setUnread((u) => Math.max(0, u - 1))
    await fetch(`${API_URL}/notifications/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined)
  }

  const renderIcon = (item: NotificationItem) => {
    if (item.related_entity_type === 'budget_exceeded') {
      return <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
    }
    if (item.related_entity_type === 'budget_warning' || item.type === 'limit_alert') {
      return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
    }
    if (item.related_entity_type === 'recurring_due') {
      return <Calendar className="w-4 h-4 text-blue-500 shrink-0" aria-hidden="true" />
    }
    if (item.type === 'goal_progress') {
      return <Trophy className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
    }
    return <Sparkles className="w-4 h-4 text-purple-500 shrink-0" aria-hidden="true" />
  }

  const getTargetHref = (item: NotificationItem): string | null => {
    if (item.related_entity_type?.startsWith('budget')) return '/dashboard/budgets'
    if (item.related_entity_type?.startsWith('recurring')) return '/dashboard/recurring'
    if (item.related_entity_type === 'goal') return '/dashboard/goals'
    return null
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) fetchNotifications()
        }}
        data-testid="notifications-bell"
        aria-label={unread > 0 ? `Notificações (${unread} não lidas)` : 'Notificações'}
        aria-expanded={open}
        className="liquid-btn liquid-btn-glass relative p-2 rounded-full text-slate-700 dark:text-slate-200"
        title="Alertas e Notificações"
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Central de notificações"
          className="glass-modal absolute right-0 mt-2.5 w-[340px] sm:w-[380px] max-w-[92vw] rounded-2xl overflow-hidden z-50"
        >
          <div className="px-4 py-3 border-b border-white/40 dark:border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-700 dark:text-slate-200" aria-hidden="true" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Alertas</h3>
              {unread > 0 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
                  {unread} nova(s)
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Marcar lidas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-white/35 dark:divide-white/10">
            {loading && items.length === 0 ? (
              <p className="p-5 text-center text-xs text-slate-500">Verificando alertas...</p>
            ) : items.length === 0 ? (
              <div className="p-6 text-center space-y-1">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Tudo em dia!</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Alertas de budgets acima de 80%, contas fixas vencendo e metas alcançadas aparecem aqui.
                </p>
              </div>
            ) : (
              items.map((item) => {
                const href = getTargetHref(item)
                return (
                  <div
                    key={item.id}
                    className={`p-3.5 flex items-start gap-3 transition-colors ${
                      item.is_read
                        ? 'opacity-70 hover:opacity-100'
                        : 'bg-white/45 dark:bg-white/5'
                    }`}
                  >
                    <div className="mt-0.5">{renderIcon(item)}</div>
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => !item.is_read && markRead(item.id)}
                    >
                      <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                        {item.message}
                      </p>
                      {href && (
                        <Link
                          href={href}
                          onClick={() => {
                            if (!item.is_read) markRead(item.id)
                            setOpen(false)
                          }}
                          className="inline-block mt-1 text-[11px] font-semibold hover:underline"
                          style={{ color: 'var(--accent)' }}
                        >
                          Ver detalhes →
                        </Link>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(item.id, !item.is_read)}
                      aria-label="Dispensar notificação"
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

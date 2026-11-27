'use client'

import React, { useEffect, useState } from 'react'
import { Trophy, Flame, Award, CheckCircle2, Lock } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Badge {
  id: string
  icon: string
  title: string
  desc: string
  xp: number
  unlocked: boolean
}

interface GamificationPayload {
  level: number
  level_label: string
  xp: number
  next_level_xp: number
  active_days_30d: number
  unlocked_count: number
  total_badges: number
  badges: Badge[]
  debt_free: {
    is_debt_free: boolean
    total_debt_balance: number
    monthly_payment: number
    months_remaining: number
    debt_free_ym: string | null
  }
}

export function GamificationAndAchievements({ token }: { token?: string }) {
  const [data, setData] = useState<GamificationPayload | null>(null)

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/insights/gamification`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d)
      })
      .catch(() => undefined)
  }, [token])

  if (!data) return null

  const pct = Math.min(100, Math.round(((data.xp % 250) / 250) * 100))

  return (
    <section className="glass-panel p-5 sm:p-6 space-y-5" aria-label="Meu Desempenho e Conquistas">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-sm shrink-0">
            <Trophy className="w-5 h-5" />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                Meu Desempenho · Nível {data.level} ({data.level_label})
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                {data.xp} XP
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {data.unlocked_count} de {data.total_badges} conquistas desbloqueadas · {data.active_days_30d} dia(s) com atividade nos últimos 30d
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 min-w-[200px]">
          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-orange-500" /> Próx. Nível
              </span>
              <span>{data.xp} / {data.next_level_xp} XP</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200/80 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {data.badges.map((b) => (
          <div
            key={b.id}
            className={`glass-card p-3 space-y-1.5 transition ${
              b.unlocked
                ? 'border-emerald-400/40 bg-emerald-500/5'
                : 'opacity-55 grayscale'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xl" aria-hidden="true">{b.icon}</span>
              {b.unlocked ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-slate-400" />
              )}
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{b.title}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">{b.desc}</p>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
              <Award className="w-3 h-3" /> +{b.xp} XP
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

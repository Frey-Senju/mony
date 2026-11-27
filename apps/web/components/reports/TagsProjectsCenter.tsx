'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Hash, Search, ChevronDown, ChevronUp, ArrowUpRight } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface TagItem {
  id: string
  description: string
  amount: number
  type: string
  date: string
  statement_month: string
  category_name: string
}

interface TagBucket {
  tag: string
  count: number
  total_expenses: number
  total_income: number
  net: number
  first_date: string
  last_date: string
  items: TagItem[]
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

export function TagsProjectsCenter({ token }: { token?: string }) {
  const [tags, setTags] = useState<TagBucket[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedTag, setExpandedTag] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    fetch(`${API_URL}/insights/tags-summary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (active && body?.tags) setTags(body.tags)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  const filtered = search.trim()
    ? tags.filter((t) => t.tag.toLowerCase().includes(search.trim().toLowerCase()))
    : tags

  return (
    <section className="glass-card p-6 space-y-4" aria-label="Central de Tags e Projetos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Hash className="w-5 h-5 text-indigo-500" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Central de #Tags &amp; Projetos ({tags.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Acompanhe quanto custou cada viagem, obra, evento ou reembolso marcado com #tags nos lançamentos
            </p>
          </div>
        </div>
        {tags.length > 0 && (
          <div className="relative w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar #tag..."
              className="input-base pl-8 py-1.5 text-xs"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-24 rounded-2xl bg-white/40 dark:bg-white/5 animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300/80 dark:border-white/15 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
          {tags.length === 0
            ? 'Nenhuma #tag cadastrada ainda. Abra as opções de qualquer lançamento na planilha para adicionar tags como #viagem, #obra ou #reembolso!'
            : `Nenhuma tag encontrada para "${search}".`}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((bucket) => {
            const open = expandedTag === bucket.tag
            return (
              <div
                key={bucket.tag}
                className="rounded-2xl border border-white/50 dark:border-white/10 bg-white/45 dark:bg-white/5 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedTag(open ? null : bucket.tag)}
                  className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-white/50 dark:hover:bg-white/5 transition"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                        {bucket.tag}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {bucket.count} lançamento{bucket.count > 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {bucket.first_date.slice(8, 10)}/{bucket.first_date.slice(5, 7)}/{bucket.first_date.slice(0, 4)}
                      {bucket.last_date !== bucket.first_date
                        ? ` → ${bucket.last_date.slice(8, 10)}/${bucket.last_date.slice(5, 7)}/${bucket.last_date.slice(0, 4)}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-right">
                    <div>
                      {bucket.total_expenses > 0 && (
                        <p className="text-sm font-extrabold text-rose-600 dark:text-rose-400 tabular-nums money-value">
                          -{brl(bucket.total_expenses)}
                        </p>
                      )}
                      {bucket.total_income > 0 && (
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums money-value">
                          +{brl(bucket.total_income)}
                        </p>
                      )}
                    </div>
                    {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {open && (
                  <div className="px-4 py-3 border-t border-white/40 dark:border-white/10 bg-white/30 dark:bg-black/15 space-y-2">
                    {bucket.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between gap-2 text-xs">
                        <Link
                          href={`/dashboard?month=${encodeURIComponent(it.statement_month)}`}
                          className="text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate inline-flex items-center gap-1"
                        >
                          <span className="font-mono text-[10px] text-slate-400">
                            {it.date.slice(8, 10)}/{it.date.slice(5, 7)}
                          </span>
                          <span className="truncate">{it.description}</span>
                          <ArrowUpRight className="w-3 h-3 opacity-60 shrink-0" />
                        </Link>
                        <span
                          className={`font-bold tabular-nums shrink-0 money-value ${
                            it.type === 'income'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {it.type === 'income' ? '+' : '-'} {brl(it.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

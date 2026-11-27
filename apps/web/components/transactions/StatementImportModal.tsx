'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  FileSpreadsheet,
  Upload,
  X,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  CheckSquare,
  Square,
} from 'lucide-react'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface AccountOption {
  id: string
  name: string
  icon?: string | null
}

interface PreviewRow {
  row_id: string
  transaction_date: string
  description: string
  amount: number
  type: 'income' | 'expense'
  category_name: string
  external_id?: string | null
  is_duplicate: boolean
  selected: boolean
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

export function StatementImportModal({
  open,
  token,
  accounts,
  categoryNames,
  onClose,
  onImported,
}: {
  open: boolean
  token?: string
  accounts: AccountOption[]
  categoryNames: string[]
  onClose: () => void
  onImported: () => void
}) {
  const [accountId, setAccountId] = useState('')
  const [filename, setFilename] = useState('')
  const [formatBadge, setFormatBadge] = useState<'CSV' | 'OFX' | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (!accountId && accounts.length > 0) setAccountId(accounts[0].id)
  }, [open, accountId, accounts])

  const resetAll = () => {
    setFilename('')
    setFormatBadge(null)
    setRows([])
    setErr(null)
  }

  const handleFile = async (file: File) => {
    if (!token) return
    const targetAcct = accountId || accounts[0]?.id
    if (!targetAcct) {
      setErr('Cadastre ao menos uma conta antes de importar extratos.')
      return
    }
    setErr(null)
    setParsing(true)
    setFilename(file.name)
    try {
      // Try UTF-8 first; if replacement characters appear (common in Brazilian bank ISO-8859-1 files), re-read as latin1
      let text = await file.text()
      if (text.includes('\uFFFD')) {
        const buf = await file.arrayBuffer()
        text = new TextDecoder('iso-8859-1').decode(buf)
      }
      const res = await fetch(`${API_URL}/transactions/import-preview`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_id: targetAcct,
          filename: file.name,
          content: text,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.detail || 'Não foi possível ler o extrato.')
      }
      setFormatBadge(data.format === 'OFX' ? 'OFX' : 'CSV')
      const mapped: PreviewRow[] = (data.items || []).map((it: Omit<PreviewRow, 'selected'>) => ({
        ...it,
        selected: !it.is_duplicate,
      }))
      setRows(mapped)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Erro ao processar arquivo')
      setRows([])
    } finally {
      setParsing(false)
    }
  }

  const selectedRows = useMemo(() => rows.filter((r) => r.selected), [rows])
  const selectedIncome = useMemo(
    () => selectedRows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0),
    [selectedRows]
  )
  const selectedExpense = useMemo(
    () => selectedRows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0),
    [selectedRows]
  )
  const duplicatesCount = useMemo(() => rows.filter((r) => r.is_duplicate).length, [rows])

  const handleCommit = async () => {
    if (!token || selectedRows.length === 0) return
    const targetAcct = accountId || accounts[0]?.id
    if (!targetAcct) return
    setCommitting(true)
    setErr(null)
    try {
      const res = await fetch(`${API_URL}/transactions/import-commit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_id: targetAcct,
          items: selectedRows.map((r) => ({
            transaction_date: r.transaction_date,
            description: r.description,
            amount: r.amount.toFixed(2),
            type: r.type,
            category_name: r.category_name || 'Outros',
            external_id: r.external_id || undefined,
            tags: ['#extrato'],
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Falha ao importar lançamentos.')
      dispatchToast(
        `${data.inserted} lançamento(s) importado(s) do extrato ${filename}!`,
        'success'
      )
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mony:transactions-updated'))
      }
      resetAll()
      onImported()
      onClose()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Erro ao salvar lote')
    } finally {
      setCommitting(false)
    }
  }

  if (!open) return null

  const catOptions = Array.from(new Set(['Outros', ...categoryNames]))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stmt-import-title"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-4xl max-h-[90vh] flex flex-col p-6 gap-4 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <span
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm"
              style={{ background: 'var(--accent)' }}
            >
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <div>
              <h2 id="stmt-import-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Importar Extrato Bancário (CSV / OFX)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Leitura instantânea para Nubank, Inter, Itaú, Bradesco, C6, Santander, BTG e OFX padrão · com anti-duplicata
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar importador"
            className="p-2 rounded-xl text-slate-500 hover:bg-white/60 dark:hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Account Selector */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Conta de destino:
          </label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="liquid-input text-xs py-1.5 min-w-[220px]"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon || '🏦'} {a.name}
              </option>
            ))}
          </select>
          {formatBadge && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300">
              {formatBadge} · {filename}
            </span>
          )}
          {rows.length > 0 && (
            <button
              type="button"
              onClick={resetAll}
              className="ml-auto text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white underline"
            >
              Trocar arquivo
            </button>
          )}
        </div>

        {/* Dropzone OR Preview Table */}
        {rows.length === 0 ? (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f) handleFile(f)
            }}
            onClick={() => inputRef.current?.click()}
            className={`glass-card border-2 border-dashed p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
              dragOver
                ? 'border-blue-500 bg-blue-500/10 scale-[1.01]'
                : 'border-slate-300/80 dark:border-white/20 hover:border-blue-400'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.ofx,.qfx,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
            />
            <Upload className="w-10 h-10 text-blue-500" />
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {parsing ? 'Analisando extrato e verificando duplicatas...' : 'Arraste seu arquivo CSV ou OFX aqui'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                ou clique para selecionar · Suas Regras Automáticas de categorização serão aplicadas automaticamente
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            {/* Stats & bulk toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-slate-200/70 dark:bg-white/10 font-semibold text-slate-700 dark:text-slate-200">
                  {selectedRows.length} de {rows.length} selecionado(s)
                </span>
                {duplicatesCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold inline-flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {duplicatesCount} possível(is) duplicata(s) desmarcada(s)
                  </span>
                )}
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                  +{brl(selectedIncome)}
                </span>
                <span className="text-rose-600 dark:text-rose-400 font-semibold tabular-nums">
                  -{brl(selectedExpense)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.map((r) => ({ ...r, selected: !r.is_duplicate })))}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Apenas novos
                </button>
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.map((r) => ({ ...r, selected: true })))}
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.map((r) => ({ ...r, selected: false })))}
                  className="text-xs font-semibold text-slate-500 hover:underline"
                >
                  Nenhum
                </button>
              </div>
            </div>

            {/* Scrollable editable preview table */}
            <div className="flex-1 overflow-auto rounded-2xl border border-white/50 dark:border-white/10 bg-white/40 dark:bg-slate-900/40">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-600 dark:text-slate-300 border-b border-slate-200/70 dark:border-white/10">
                  <tr>
                    <th className="p-2.5 text-left w-8" />
                    <th className="p-2.5 text-left">Data</th>
                    <th className="p-2.5 text-left">Descrição</th>
                    <th className="p-2.5 text-left">Categoria</th>
                    <th className="p-2.5 text-center">Tipo</th>
                    <th className="p-2.5 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                  {rows.map((r) => (
                    <tr
                      key={r.row_id}
                      className={`transition ${
                        r.selected ? 'bg-white/50 dark:bg-white/5' : 'opacity-50'
                      }`}
                    >
                      <td className="p-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            setRows((prev) =>
                              prev.map((x) => (x.row_id === r.row_id ? { ...x, selected: !x.selected } : x))
                            )
                          }
                          aria-label={`Selecionar ${r.description}`}
                          className="text-blue-600 dark:text-blue-400"
                        >
                          {r.selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-slate-400" />}
                        </button>
                      </td>
                      <td className="p-2.5 tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {r.transaction_date.split('-').reverse().join('/')}
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-900 dark:text-white truncate max-w-[260px]">
                            {r.description}
                          </span>
                          {r.is_duplicate && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 shrink-0">
                              Duplicata
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5">
                        <select
                          value={r.category_name}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) => (x.row_id === r.row_id ? { ...x, category_name: e.target.value } : x))
                            )
                          }
                          className="bg-white/70 dark:bg-slate-800/80 border border-slate-300/60 dark:border-white/15 rounded-lg px-2 py-1 text-xs"
                        >
                          {catOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setRows((prev) =>
                              prev.map((x) =>
                                x.row_id === r.row_id
                                  ? { ...x, type: x.type === 'income' ? 'expense' : 'income' }
                                  : x
                              )
                            )
                          }
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.type === 'income'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {r.type === 'income' ? 'Receita' : 'Despesa'}
                        </button>
                      </td>
                      <td
                        className={`p-2.5 text-right font-bold tabular-nums whitespace-nowrap ${
                          r.type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {r.type === 'income' ? '+' : '-'}
                        {brl(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {err && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 shrink-0">
            {err}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/40 dark:border-white/10 shrink-0">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            Todos os itens importados recebem a tag <code>#extrato</code> e atualizam o saldo da conta.
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-xs font-semibold">
              Fechar
            </button>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={handleCommit}
                disabled={committing || selectedRows.length === 0}
                className="liquid-btn liquid-btn-primary px-5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {committing ? 'Importando...' : `Importar ${selectedRows.length} Lançamento(s)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

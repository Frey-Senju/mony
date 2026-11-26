'use client'

import React, { useState } from 'react'
import {
  FileSpreadsheet,
  Link2,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Repeat,
  CreditCard,
} from 'lucide-react'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const MONTH_OPTIONS = [
  { num: 1, short: 'Jan' },
  { num: 2, short: 'Fev' },
  { num: 3, short: 'Mar' },
  { num: 4, short: 'Abr' },
  { num: 5, short: 'Mai' },
  { num: 6, short: 'Jun' },
  { num: 7, short: 'Jul' },
  { num: 8, short: 'Ago' },
  { num: 9, short: 'Set' },
  { num: 10, short: 'Out' },
  { num: 11, short: 'Nov' },
  { num: 12, short: 'Dez' },
]

interface SheetItem {
  description: string
  merchant_name?: string | null
  type: 'income' | 'expense'
  amount: number
  category_name: string
  payment_method?: string
  payment_account_label?: string | null
  transaction_date: string
  original_purchase_date?: string | null
  statement_month: string
  installment_number?: number | null
  installment_total?: number | null
  is_recurring: boolean
  is_reconciled: boolean
  is_duplicate?: boolean
  sheet_name?: string
}

interface SheetAnalysis {
  source_name: string
  year: number
  available_months: Array<{ month: number; name: string; statement_month: string }>
  detected_categories: string[]
  detected_payment_accounts: string[]
  duplicates_detected: number
  counts: {
    total: number
    incomes: number
    expenses: number
    recurrences: number
    installments: number
  }
  totals: {
    income: number
    expenses: number
  }
  items: SheetItem[]
}

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function SpreadsheetImporterTab({
  authFetch,
  accounts,
  defaultAccountId,
}: {
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  accounts: Array<{ id: string; name: string }>
  defaultAccountId: string
}) {
  const [sheetsUrl, setSheetsUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [year, setYear] = useState(2026)
  const [selectedMonths, setSelectedMonths] = useState<number[]>([])
  const [accountId, setAccountId] = useState(defaultAccountId)
  const [autoCategories, setAutoCategories] = useState(true)
  const [autoAccounts, setAutoAccounts] = useState(true)
  const [autoRecurring, setAutoRecurring] = useState(true)

  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [analysis, setAnalysis] = useState<SheetAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const toggleMonth = (m: number) => {
    setSelectedMonths((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b)
    )
  }

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sheetsUrl.trim() && !file) {
      setError('Cole o link do Google Sheets ou selecione um arquivo .xlsx.')
      return
    }
    setAnalyzing(true)
    setError(null)
    setSuccess(null)
    setAnalysis(null)
    try {
      const fd = new FormData()
      fd.append('year', String(year))
      if (selectedMonths.length > 0) {
        fd.append('months', selectedMonths.join(','))
      }
      if (file) {
        fd.append('file', file)
      } else {
        fd.append('sheets_url', sheetsUrl.trim())
      }
      const res = await authFetch(`${API_URL}/ai/analyze-spreadsheet`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.detail || 'Não foi possível analisar a planilha')
      }
      setAnalysis(data)
      if (!accountId && accounts[0]) setAccountId(accounts[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ler planilha')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleImport = async () => {
    if (!analysis || analysis.items.length === 0) return
    const targetAccount = accountId || defaultAccountId || accounts[0]?.id
    if (!targetAccount) {
      setError('Selecione uma conta padrão de destino.')
      return
    }
    setImporting(true)
    setError(null)
    try {
      const res = await authFetch(`${API_URL}/ai/import-spreadsheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: targetAccount,
          auto_create_categories: autoCategories,
          auto_create_accounts: autoAccounts,
          auto_register_recurring: autoRecurring,
          skip_duplicates: true,
          items: analysis.items.map(({ is_duplicate: _d, sheet_name: _s, ...rest }) => rest),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Erro ao importar planilha')
      const msg = `${data.imported} lançamento(s) importado(s) com sucesso! (${data.created_categories} categorias, ${data.created_accounts} contas/cartões e ${data.created_recurrences} recorrências criadas · ${data.skipped_duplicates} duplicata(s) ignorada(s))`
      setSuccess(msg)
      setAnalysis(null)
      dispatchToast('Planilha 2026 importada com sucesso!', 'success')
      window.dispatchEvent(new Event('mony:transactions-updated'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar lançamentos')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      <div className="glass-card p-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
        <p className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
          Importador Inteligente de Planilha Financeira (2026)
        </p>
        <p>
          Lê automaticamente todas as abas mensais (<strong>Janeiro a Dezembro</strong>): Entradas, Saídas, Categorias, Data da Compra, Parcelas (<code>8 de 10</code>), Recorrências (<code>∞</code>), Status (<code>✅</code>) e Pagamento (<code>Cartão Bradesco</code>, <code>Cartão XP</code>, <code>PIX</code>, <code>Boleto</code>).
        </p>
      </div>

      <form onSubmit={handleAnalyze} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
            Link do Google Sheets (compartilhado para leitura)
          </label>
          <div className="relative">
            <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="url"
              value={sheetsUrl}
              onChange={(e) => {
                setSheetsUrl(e.target.value)
                if (e.target.value) setFile(null)
              }}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="input-base pl-9 text-xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex-1 border-t border-slate-200 dark:border-white/10" />
          OU envie o arquivo .xlsx
          <span className="flex-1 border-t border-slate-200 dark:border-white/10" />
        </div>

        <label className="glass-card p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/60 dark:hover:bg-white/10 transition text-xs">
          <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200 truncate">
            <Upload className="w-4 h-4 text-blue-500 shrink-0" />
            {file ? file.name : 'Escolher arquivo Excel (.xlsx)...'}
          </span>
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] || null
              setFile(f)
              if (f) setSheetsUrl('')
            }}
          />
        </label>

        <div className="grid grid-cols-3 gap-2 items-end">
          <div>
            <label className="block text-xs font-medium mb-1">Ano base</label>
            <input
              type="number"
              min={2020}
              max={2035}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="input-base text-xs"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium mb-1">Conta padrão (PIX / Boleto / Entradas)</label>
            <select
              value={accountId || defaultAccountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="input-base text-xs"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            Filtrar meses (deixe vazio para ler o ano inteiro Jan–Dez):
          </p>
          <div className="flex flex-wrap gap-1">
            {MONTH_OPTIONS.map((m) => {
              const active = selectedMonths.includes(m.num)
              return (
                <button
                  key={m.num}
                  type="button"
                  onClick={() => toggleMonth(m.num)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/60 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {m.short}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={analyzing || (!sheetsUrl.trim() && !file)}
          className="liquid-btn liquid-btn-primary w-full py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {analyzing ? 'Lendo abas e estruturando dados...' : 'Analisar Planilha com IA'}
        </button>
      </form>

      {error && (
        <div role="alert" className="glass-card p-3 border-rose-400/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div role="status" className="glass-card p-4 border-emerald-400/60 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {analysis && (
        <div className="glass-card p-4 border-emerald-400/45 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              Prévia: {analysis.counts.total} lançamentos encontrados
            </p>
            {analysis.duplicates_detected > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                {analysis.duplicates_detected} duplicata(s) serão ignoradas
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-emerald-500/10">
              <p className="text-[10px] text-slate-500">Entradas ({analysis.counts.incomes})</p>
              <p className="font-bold text-emerald-700 dark:text-emerald-400">{brl(analysis.totals.income)}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-500/10">
              <p className="text-[10px] text-slate-500">Saídas ({analysis.counts.expenses})</p>
              <p className="font-bold text-rose-700 dark:text-rose-400">{brl(analysis.totals.expenses)}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-500/10">
              <p className="text-[10px] text-slate-500 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Parcelas</p>
              <p className="font-bold text-blue-700 dark:text-blue-400">{analysis.counts.installments}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-violet-500/10">
              <p className="text-[10px] text-slate-500 flex items-center gap-1"><Repeat className="w-3 h-3" /> Recorrências ∞</p>
              <p className="font-bold text-violet-700 dark:text-violet-400">{analysis.counts.recurrences}</p>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={autoCategories} onChange={(e) => setAutoCategories(e.target.checked)} />
              Criar categorias exatas da planilha ({analysis.detected_categories.length} detectadas)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={autoAccounts} onChange={(e) => setAutoAccounts(e.target.checked)} />
              Criar/vincular contas e cartões da planilha ({analysis.detected_payment_accounts.join(', ') || 'nenhum'})
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={autoRecurring} onChange={(e) => setAutoRecurring(e.target.checked)} />
              Cadastrar itens marcados com ∞ automaticamente em Recorrentes
            </label>
          </div>

          <div className="max-h-44 overflow-y-auto border-t border-slate-200/60 dark:border-white/10 pt-2 space-y-1">
            {analysis.items.slice(0, 25).map((it, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-slate-200/30 dark:border-white/5">
                <span className="truncate">
                  <strong className="text-slate-900 dark:text-white">{it.description}</strong>{' '}
                  <span className="text-slate-400">
                    ({it.statement_month} · {it.category_name}
                    {it.is_recurring ? ' · ∞' : it.installment_total ? ` · ${it.installment_number}/${it.installment_total}` : ''})
                  </span>
                </span>
                <span className={`font-bold shrink-0 ${it.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {it.type === 'income' ? '+' : '-'} {brl(it.amount)}
                </span>
              </div>
            ))}
            {analysis.items.length > 25 && (
              <p className="text-[10px] text-center text-slate-400 pt-1">
                + {analysis.items.length - 25} outros lançamentos incluídos na importação
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={importing}
            onClick={handleImport}
            className="liquid-btn liquid-btn-primary w-full py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {importing ? 'Importando para o Mony...' : `Confirmar e Importar ${analysis.counts.total} Lançamentos`}
          </button>
        </div>
      )}
    </div>
  )
}

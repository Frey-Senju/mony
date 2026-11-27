'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import {
  Users,
  Briefcase,
  Receipt,
  Plus,
  Trash2,
  CheckCircle2,
  Copy,
  Car,
  Printer,
  ArrowRight,
  UserPlus,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { useAuth } from '@/stores/auth/useAuth'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

interface WorkspaceMember {
  id: string
  member_name: string
  member_email?: string | null
  role: 'owner' | 'editor' | 'viewer'
  monthly_income: number
}

interface SharedExpense {
  id: string
  paid_by_member_id: string
  paid_by_name: string
  description: string
  category: string
  amount: number
  expense_date: string
  is_settled: boolean
}

interface WorkspaceItem {
  id: string
  name: string
  split_mode: 'equal' | 'proportional'
  invite_code: string
  members: WorkspaceMember[]
  expenses: SharedExpense[]
  settlement: {
    total_open: number
    total_all: number
    balances: Array<{
      member_id: string
      member_name: string
      role: string
      monthly_income: number
      share_pct: number
      paid: number
      fair_share: number
      net_balance: number
    }>
    transfers: Array<{ from: string; to: string; amount: number }>
  }
}

interface DrePayload {
  year: number
  scope: string
  tax_rate_pct: number
  transactions_count: number
  dre: {
    gross_revenue: number
    estimated_taxes: number
    net_revenue: number
    variable_expenses: number
    contribution_margin: number
    fixed_costs: number
    net_profit: number
    net_margin_pct: number
  }
  cost_centers: Array<{ category: string; total: number; count: number }>
  monthly_series: Array<{ month: number; label: string; revenue: number; expenses: number; profit: number }>
}

interface ReimbursementReport {
  id: string
  title: string
  client_or_company?: string | null
  status: 'draft' | 'submitted' | 'reimbursed'
  km_rate: number
  total_amount: number
  total_km: number
  items_count: number
  items: Array<{
    id: string
    description: string
    category: string
    amount: number
    item_date: string
    is_mileage: boolean
    km_distance: number
  }>
}

export default function WorkspacesPage() {
  return (
    <PrivateRoute>
      <WorkspacesHub />
    </PrivateRoute>
  )
}

function WorkspacesHub() {
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const [tab, setTab] = useState<'couple' | 'dre' | 'reimbursements'>('couple')

  // Couple/Family state
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [wsName, setWsName] = useState('Casa & Casal')
  const [wsSplit, setWsSplit] = useState<'equal' | 'proportional'>('proportional')
  const [ownerIncome, setOwnerIncome] = useState('6000')
  const [memName, setMemName] = useState('')
  const [memEmail, setMemEmail] = useState('')
  const [memRole, setMemRole] = useState<'editor' | 'viewer'>('editor')
  const [memIncome, setMemIncome] = useState('4000')
  const [expDesc, setExpDesc] = useState('')
  const [expAmt, setExpAmt] = useState('')
  const [expCat, setExpCat] = useState('Moradia')
  const [expPayer, setExpPayer] = useState('')

  // PJ/MEI DRE state
  const [dreYear, setDreYear] = useState(() => new Date().getFullYear())
  const [dreScope, setDreScope] = useState<'all' | 'pj' | 'pf'>('all')
  const [taxRate, setTaxRate] = useState(6)
  const [dre, setDre] = useState<DrePayload | null>(null)

  // Expensify Reimbursements state
  const [reports, setReports] = useState<ReimbursementReport[]>([])
  const [pendingReimb, setPendingReimb] = useState(0)
  const [paidReimb, setPaidReimb] = useState(0)
  const [repTitle, setRepTitle] = useState('')
  const [repClient, setRepClient] = useState('')
  const [repKmRate, setRepKmRate] = useState('1.50')
  const [activeRepId, setActiveRepId] = useState<string | null>(null)
  const [itemDesc, setItemDesc] = useState('')
  const [itemAmt, setItemAmt] = useState('')
  const [itemIsKm, setItemIsKm] = useState(false)
  const [itemKm, setItemKm] = useState('')

  useEffect(() => {
    document.title = 'Mony · Modo Casal, PJ/MEI (DRE) & Reembolsos'
  }, [])

  const loadWorkspaces = useCallback(async () => {
    if (!token) return
    const res = await fetch(`${API_URL}/workspaces`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const list: WorkspaceItem[] = (await res.json()).items || []
      setWorkspaces(list)
      if (list[0]?.members[0] && !expPayer) setExpPayer(list[0].members[0].id)
    }
  }, [token, expPayer])

  const loadDre = useCallback(async () => {
    if (!token) return
    const res = await fetch(
      `${API_URL}/workspaces/business/dre?year=${dreYear}&scope=${dreScope}&tax_rate_pct=${taxRate}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (res.ok) setDre(await res.json())
  }, [token, dreYear, dreScope, taxRate])

  const loadReimbursements = useCallback(async () => {
    if (!token) return
    const res = await fetch(`${API_URL}/workspaces/reimbursements`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const d = await res.json()
      setReports(d.items || [])
      setPendingReimb(d.pending_total || 0)
      setPaidReimb(d.reimbursed_total || 0)
      if (!activeRepId && d.items?.[0]) setActiveRepId(d.items[0].id)
    }
  }, [token, activeRepId])

  useEffect(() => {
    loadWorkspaces()
    loadReimbursements()
  }, [loadWorkspaces, loadReimbursements])

  useEffect(() => {
    loadDre()
  }, [loadDre])

  const activeWs = workspaces[0] || null
  const activeRep = reports.find((r) => r.id === activeRepId) || reports[0] || null

  const createWs = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    const res = await fetch(`${API_URL}/workspaces`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: wsName.trim(),
        split_mode: wsSplit,
        owner_monthly_income: Number(ownerIncome) || 0,
      }),
    })
    if (res.ok) {
      dispatchToast('Espaço Casal/Família criado!', 'success')
      await loadWorkspaces()
    }
  }

  const toggleSplitMode = async (mode: 'equal' | 'proportional') => {
    if (!token || !activeWs) return
    const res = await fetch(`${API_URL}/workspaces/${activeWs.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ split_mode: mode }),
    })
    if (res.ok) {
      dispatchToast(mode === 'proportional' ? 'Divisão alterada para Proporcional à Renda!' : 'Divisão alterada para 50/50 Igualitária!', 'info')
      await loadWorkspaces()
    }
  }

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !activeWs || !memName.trim()) return
    const res = await fetch(`${API_URL}/workspaces/${activeWs.id}/members`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        member_name: memName.trim(),
        member_email: memEmail.trim() || undefined,
        role: memRole,
        monthly_income: Number(memIncome) || 0,
      }),
    })
    if (res.ok) {
      setMemName('')
      setMemEmail('')
      dispatchToast('Membro adicionado ao espaço compartilhado!', 'success')
      await loadWorkspaces()
    }
  }

  const addSharedExp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !activeWs || !expDesc.trim()) return
    const payerId = expPayer || activeWs.members[0]?.id
    if (!payerId) return
    const res = await fetch(`${API_URL}/workspaces/${activeWs.id}/expenses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paid_by_member_id: payerId,
        description: expDesc.trim(),
        category: expCat,
        amount: Number(expAmt.replace(',', '.')) || 0,
      }),
    })
    if (res.ok) {
      setExpDesc('')
      setExpAmt('')
      dispatchToast('Despesa compartilhada lançada e acerto recalculado!', 'success')
      await loadWorkspaces()
    }
  }

  const settleAll = async () => {
    if (!token || !activeWs) return
    const res = await fetch(`${API_URL}/workspaces/${activeWs.id}/settle`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      dispatchToast('Contas do mês acertadas! Saldo zerado entre os membros.', 'success')
      await loadWorkspaces()
    }
  }

  const createReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !repTitle.trim()) return
    const res = await fetch(`${API_URL}/workspaces/reimbursements`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: repTitle.trim(),
        client_or_company: repClient.trim() || undefined,
        km_rate: Number(repKmRate.replace(',', '.')) || 1.5,
      }),
    })
    if (res.ok) {
      const created = await res.json()
      setRepTitle('')
      setRepClient('')
      setActiveRepId(created.id)
      dispatchToast('Relatório de reembolso criado!', 'success')
      await loadReimbursements()
    }
  }

  const addRepItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !activeRep || !itemDesc.trim()) return
    const res = await fetch(`${API_URL}/workspaces/reimbursements/${activeRep.id}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: itemDesc.trim(),
        amount: itemIsKm ? 0 : Number(itemAmt.replace(',', '.')) || 0,
        is_mileage: itemIsKm,
        km_distance: itemIsKm ? Number(itemKm.replace(',', '.')) || 0 : 0,
      }),
    })
    if (res.ok) {
      setItemDesc('')
      setItemAmt('')
      setItemKm('')
      dispatchToast(itemIsKm ? 'Quilometragem lançada no relatório!' : 'Despesa adicionada ao reembolso!', 'success')
      await loadReimbursements()
    }
  }

  const updateRepStatus = async (id: string, status: 'draft' | 'submitted' | 'reimbursed') => {
    if (!token) return
    await fetch(`${API_URL}/workspaces/reimbursements/${id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    dispatchToast(`Status atualizado para "${status === 'reimbursed' ? 'Reembolsado' : status === 'submitted' ? 'Enviado' : 'Rascunho'}"!`, 'success')
    await loadReimbursements()
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="glass-panel p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
              style={{ background: 'var(--accent)' }}
            >
              <Users className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                Casal &amp; Família · PJ/MEI (DRE) · Reembolsos
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Finanças compartilhadas com acerto automático, DRE gerencial MEI/PJ e relatórios de reembolso &amp; KM
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print liquid-btn liquid-btn-glass px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/40 dark:border-white/10" role="tablist">
          {(
            [
              { id: 'couple', label: 'Modo Casal & Família (até 5)', icon: Users },
              { id: 'dre', label: 'Modo PJ / MEI & DRE Gerencial', icon: Briefcase },
              { id: 'reimbursements', label: 'Reembolsos & Quilometragem (KM)', icon: Receipt },
            ] as const
          ).map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                  tab === t.id ? 'liquid-nav-active shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
      </header>

      {/* TAB 1: MODO CASAL & FAMÍLIA */}
      {tab === 'couple' && (
        !activeWs ? (
          <form onSubmit={createWs} className="glass-panel p-6 max-w-xl mx-auto space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Criar Espaço Compartilhado (Casal ou Família)
            </h2>
            <p className="text-xs text-slate-500">
              Convide até 5 pessoas com papéis (Proprietário, Editor, Visualizador) e divida contas 50/50 ou proporcional à renda!
            </p>
            <input
              type="text"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              placeholder="Nome (ex: Finanças do Casal)"
              className="liquid-input w-full text-sm"
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={wsSplit}
                onChange={(e) => setWsSplit(e.target.value as 'equal' | 'proportional')}
                className="liquid-input text-xs"
              >
                <option value="proportional">⚖️ Proporcional à Renda</option>
                <option value="equal">½ Divisão Igualitária (50/50)</option>
              </select>
              <input
                type="number"
                value={ownerIncome}
                onChange={(e) => setOwnerIncome(e.target.value)}
                placeholder="Sua renda mensal (R$)"
                className="liquid-input text-xs"
              />
            </div>
            <button type="submit" className="liquid-btn liquid-btn-primary w-full py-2.5 rounded-xl text-sm font-semibold">
              Criar Espaço Compartilhado
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            {/* Workspace Header + Settlement Banner */}
            <div className="glass-panel p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{activeWs.name}</h2>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(activeWs.invite_code)
                      dispatchToast(`Código de convite ${activeWs.invite_code} copiado!`, 'success')
                    }}
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 inline-flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> {activeWs.invite_code}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Total em aberto: <strong className="money-value">{brl(activeWs.settlement.total_open)}</strong> · {activeWs.members.length}/5 membros
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex p-1 rounded-xl bg-white/55 dark:bg-white/10 border border-white/60 dark:border-white/15 text-xs">
                  <button
                    type="button"
                    onClick={() => toggleSplitMode('equal')}
                    className={`px-3 py-1 rounded-lg font-semibold ${activeWs.split_mode === 'equal' ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    50/50 Igual
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSplitMode('proportional')}
                    className={`px-3 py-1 rounded-lg font-semibold ${activeWs.split_mode === 'proportional' ? 'liquid-nav-active' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    Proporcional à Renda
                  </button>
                </div>
                {activeWs.settlement.total_open > 0 && (
                  <button
                    type="button"
                    onClick={settleAll}
                    className="liquid-btn liquid-btn-primary px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Acertar Mês
                  </button>
                )}
              </div>
            </div>

            {/* Who owes whom */}
            {activeWs.settlement.transfers.length > 0 && (
              <div className="glass-panel p-4 border-emerald-400/45 bg-emerald-500/8 space-y-2">
                <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                  ⚖️ Acerto Automático de Contas ({activeWs.split_mode === 'proportional' ? 'Proporcional à Renda' : 'Divisão Igual'})
                </p>
                <div className="flex flex-wrap gap-3">
                  {activeWs.settlement.transfers.map((tr, i) => (
                    <div key={i} className="glass-card px-4 py-2.5 text-sm font-bold flex items-center gap-2">
                      <span className="text-rose-600 dark:text-rose-400">{tr.from}</span>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                      <span className="text-emerald-600 dark:text-emerald-400">{tr.to}</span>
                      <span className="ml-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 tabular-nums money-value">
                        {brl(tr.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Members & Add Member */}
              <div className="lg:col-span-5 glass-panel p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-blue-500" /> Membros &amp; Participação
                </h3>
                <div className="space-y-2">
                  {activeWs.settlement.balances.map((b) => (
                    <div key={b.member_id} className="glass-card p-3 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {b.member_name}{' '}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-white/10 uppercase">
                            {b.role}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Cota: <strong>{b.share_pct}%</strong> · Pagou {brl(b.paid)} · Justo {brl(b.fair_share)}
                        </p>
                      </div>
                      <span
                        className={`font-extrabold tabular-nums money-value ${
                          b.net_balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {b.net_balance >= 0 ? '+' : ''}
                        {brl(b.net_balance)}
                      </span>
                    </div>
                  ))}
                </div>
                {activeWs.members.length < 5 && (
                  <form onSubmit={addMember} className="space-y-2 pt-2 border-t border-white/40 dark:border-white/10">
                    <p className="text-[11px] font-bold text-slate-500 uppercase">Adicionar Parceiro(a) / Familiar</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={memName} onChange={(e) => setMemName(e.target.value)} placeholder="Nome" className="liquid-input text-xs" required />
                      <input type="number" value={memIncome} onChange={(e) => setMemIncome(e.target.value)} placeholder="Renda mensal (R$)" className="liquid-input text-xs" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="email" value={memEmail} onChange={(e) => setMemEmail(e.target.value)} placeholder="E-mail (opcional)" className="liquid-input text-xs" />
                      <select value={memRole} onChange={(e) => setMemRole(e.target.value as 'editor' | 'viewer')} className="liquid-input text-xs">
                        <option value="editor">Editor</option>
                        <option value="viewer">Visualizador</option>
                      </select>
                    </div>
                    <button type="submit" className="liquid-btn liquid-btn-primary w-full py-2 rounded-xl text-xs font-semibold">
                      + Adicionar Membro
                    </button>
                  </form>
                )}
              </div>

              {/* Add Shared Expense + List */}
              <div className="lg:col-span-7 glass-panel p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Despesas Compartilhadas</h3>
                <form onSubmit={addSharedExp} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <input type="text" value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Ex: Aluguel, Mercado" className="liquid-input text-xs col-span-2" required />
                  <input type="number" step="0.01" value={expAmt} onChange={(e) => setExpAmt(e.target.value)} placeholder="Valor (R$)" className="liquid-input text-xs" required />
                  <select value={expPayer || activeWs.members[0]?.id || ''} onChange={(e) => setExpPayer(e.target.value)} className="liquid-input text-xs">
                    {activeWs.members.map((m) => (
                      <option key={m.id} value={m.id}>Pago por {m.member_name}</option>
                    ))}
                  </select>
                  <input type="text" value={expCat} onChange={(e) => setExpCat(e.target.value)} placeholder="Categoria" className="liquid-input text-xs col-span-2" />
                  <button type="submit" className="liquid-btn liquid-btn-primary col-span-2 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Lançar Despesa da Casa
                  </button>
                </form>

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {activeWs.expenses.map((e) => (
                    <div key={e.id} className={`glass-card p-3 flex items-center justify-between text-xs ${e.is_settled ? 'opacity-55' : ''}`}>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {e.description}{' '}
                          {e.is_settled && <span className="text-[10px] text-emerald-600 ml-1">✓ Acertada</span>}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {e.category} · Pago por <strong>{e.paid_by_name}</strong> · {e.expense_date.split('-').reverse().join('/')}
                        </p>
                      </div>
                      <strong className="tabular-nums money-value text-slate-900 dark:text-white">{brl(e.amount)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* TAB 2: MODO PJ / MEI & DRE GERENCIAL */}
      {tab === 'dre' && dre && (
        <div className="space-y-5">
          <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ['all', 'Consolidado (PF + PJ)'],
                  ['pj', 'Somente PJ / MEI (#pj / #mei)'],
                  ['pf', 'Somente Pessoal (PF)'],
                ] as const
              ).map(([s, lbl]) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDreScope(s)}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition ${
                    dreScope === s ? 'liquid-btn-primary' : 'bg-white/55 dark:bg-white/10 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5">
                <span className="text-slate-500">Ano:</span>
                <input type="number" value={dreYear} onChange={(e) => setDreYear(Number(e.target.value))} className="liquid-input w-20 py-1 text-xs font-bold" />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-slate-500">Alíquota Imposto/DAS (%):</span>
                <input type="number" step="0.5" min={0} max={40} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className="liquid-input w-16 py-1 text-xs font-bold" />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* DRE Waterfall Table */}
            <div className="lg:col-span-5 glass-panel p-5 space-y-2.5 text-xs">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mb-2">
                DRE Gerencial · {dreYear}
              </h3>
              {[
                { label: '(+) Receita Bruta', value: dre.dre.gross_revenue, cls: 'text-emerald-600 dark:text-emerald-400 font-bold' },
                { label: `(-) Impostos / DAS (${dre.tax_rate_pct}%)`, value: -dre.dre.estimated_taxes, cls: 'text-amber-600 dark:text-amber-400' },
                { label: '(=) Receita Líquida', value: dre.dre.net_revenue, cls: 'font-bold text-slate-900 dark:text-white border-t border-white/40 dark:border-white/10 pt-2' },
                { label: '(-) Despesas Variáveis', value: -dre.dre.variable_expenses, cls: 'text-rose-600 dark:text-rose-400' },
                { label: '(=) Margem de Contribuição', value: dre.dre.contribution_margin, cls: 'font-bold text-slate-900 dark:text-white' },
                { label: '(-) Custos Fixos / Recorrentes', value: -dre.dre.fixed_costs, cls: 'text-rose-600 dark:text-rose-400' },
              ].map((row) => (
                <div key={row.label} className={`flex items-center justify-between py-1 ${row.cls}`}>
                  <span>{row.label}</span>
                  <span className="tabular-nums money-value">{brl(row.value)}</span>
                </div>
              ))}
              <div className="p-3.5 rounded-2xl bg-blue-500/12 border border-blue-400/35 flex items-center justify-between text-sm font-extrabold">
                <span className="text-slate-900 dark:text-white">(=) Lucro Líquido ({dre.dre.net_margin_pct}%)</span>
                <span className={`tabular-nums money-value ${dre.dre.net_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {brl(dre.dre.net_profit)}
                </span>
              </div>
            </div>

            {/* 12m Revenue vs Profit Chart */}
            <div className="lg:col-span-7 glass-panel p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Evolução Mensal · Faturamento vs Lucro</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dre.monthly_series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `R$${Math.round(Number(v) / 1000)}k`} axisLine={false} tickLine={false} width={52} />
                    <Tooltip formatter={(val: unknown) => brl(Number(val || 0))} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="revenue" name="Receita" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expenses" name="Despesas" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="profit" name="Lucro Líquido" fill="#0071E3" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: REEMBOLSOS & QUILOMETRAGEM (EXPENSIFY STYLE) */}
      {tab === 'reimbursements' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="glass-card p-4">
              <p className="text-xs text-slate-500">A Receber (Pendente)</p>
              <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 tabular-nums money-value">
                {brl(pendingReimb)}
              </p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-slate-500">Já Reembolsado</p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums money-value">
                {brl(paidReimb)}
              </p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-slate-500">Relatórios Criados</p>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1 tabular-nums">
                {reports.length}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Reports Sidebar + Create */}
            <div className="lg:col-span-5 glass-panel p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Novo Relatório de Reembolso</h3>
              <form onSubmit={createReport} className="space-y-2">
                <input type="text" value={repTitle} onChange={(e) => setRepTitle(e.target.value)} placeholder="Título (ex: Viagem Cliente SP)" className="liquid-input w-full text-xs" required />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={repClient} onChange={(e) => setRepClient(e.target.value)} placeholder="Empresa / Cliente" className="liquid-input text-xs" />
                  <input type="number" step="0.10" value={repKmRate} onChange={(e) => setRepKmRate(e.target.value)} placeholder="R$/km (ex: 1.50)" className="liquid-input text-xs" />
                </div>
                <button type="submit" className="liquid-btn liquid-btn-primary w-full py-2 rounded-xl text-xs font-semibold">
                  + Criar Relatório
                </button>
              </form>

              <div className="space-y-2 pt-2 border-t border-white/40 dark:border-white/10">
                {reports.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveRepId(r.id)}
                    className={`w-full glass-card p-3 text-left transition flex items-center justify-between ${
                      activeRep?.id === r.id ? 'ring-2 ring-blue-500 bg-blue-500/8' : ''
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{r.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {r.client_or_company || 'Reembolso'} · {r.items_count} item(ns) · {r.total_km} km
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-extrabold tabular-nums money-value">{brl(r.total_amount)}</p>
                      <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">{r.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Active Report Detail & KM Logger */}
            <div className="lg:col-span-7 glass-panel p-5 space-y-4">
              {!activeRep ? (
                <p className="text-xs text-slate-500 py-8 text-center">Crie ou selecione um relatório à esquerda para lançar despesas e quilometragem.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{activeRep.title}</h3>
                      <p className="text-xs text-slate-500">
                        {activeRep.client_or_company || 'Geral'} · Tarifa KM: {brl(activeRep.km_rate)}/km · Total: <strong className="money-value">{brl(activeRep.total_amount)}</strong>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(['draft', 'submitted', 'reimbursed'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => updateRepStatus(activeRep.id, st)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                            activeRep.status === st ? 'liquid-btn-primary' : 'bg-white/55 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {st === 'draft' ? 'Rascunho' : st === 'submitted' ? 'Enviado' : 'Reembolsado'}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`${API_URL}/workspaces/reimbursements/${activeRep.id}`, {
                            method: 'DELETE',
                            headers: { Authorization: `Bearer ${token}` },
                          })
                          setActiveRepId(null)
                          await loadReimbursements()
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500"
                        aria-label="Excluir relatório"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Add Expense or KM Mileage */}
                  <form onSubmit={addRepItem} className="glass-card p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setItemIsKm(false)}
                        className={`px-2.5 py-1 rounded-lg font-semibold ${!itemIsKm ? 'liquid-btn-primary' : 'bg-white/50 dark:bg-white/10'}`}
                      >
                        🧾 Despesa / Recibo
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemIsKm(true)}
                        className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 ${itemIsKm ? 'liquid-btn-primary' : 'bg-white/50 dark:bg-white/10'}`}
                      >
                        <Car className="w-3.5 h-3.5" /> Quilometragem (KM)
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={itemDesc}
                        onChange={(e) => setItemDesc(e.target.value)}
                        placeholder={itemIsKm ? 'Trajeto (ex: Escritório → Aeroporto)' : 'Descrição (ex: Almoço cliente)'}
                        className="liquid-input text-xs sm:col-span-2"
                        required
                      />
                      {itemIsKm ? (
                        <input
                          type="number"
                          step="0.5"
                          value={itemKm}
                          onChange={(e) => setItemKm(e.target.value)}
                          placeholder="Distância (km)"
                          className="liquid-input text-xs"
                          required
                        />
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          value={itemAmt}
                          onChange={(e) => setItemAmt(e.target.value)}
                          placeholder="Valor (R$)"
                          className="liquid-input text-xs"
                          required
                        />
                      )}
                    </div>
                    <button type="submit" className="liquid-btn liquid-btn-primary px-4 py-1.5 rounded-xl text-xs font-semibold">
                      + Adicionar ao Relatório
                    </button>
                  </form>

                  <div className="space-y-2">
                    {activeRep.items.map((it) => (
                      <div key={it.id} className="glass-card p-3 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {it.is_mileage ? '🚗 ' : '🧾 '}
                            {it.description}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {it.category} · {it.item_date.split('-').reverse().join('/')}
                            {it.is_mileage ? ` · ${it.km_distance} km × ${brl(activeRep.km_rate)}` : ''}
                          </p>
                        </div>
                        <strong className="tabular-nums money-value text-slate-900 dark:text-white">{brl(it.amount)}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import React, { useEffect, useState } from 'react'
import { Plus, WifiOff, X, Sparkles } from 'lucide-react'
import { useAuth } from '@/stores/auth/useAuth'
import { dispatchToast } from '@/components/ui/ToastProvider'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export function MobileQuickAddAndStatus() {
  const { tokens } = useAuth()
  const token = tokens?.access_token
  const [offline, setOffline] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [txType, setTxType] = useState<'expense' | 'income'>('expense')
  const [paymentMethod, setPaymentMethod] = useState('pix')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setOffline(!navigator.onLine)
    const onOff = () => {
      setOffline(true)
      dispatchToast('Sem conexão com a internet — modo offline.', 'error', { durationMs: 5000 })
    }
    const onOn = () => {
      setOffline(false)
      dispatchToast('Conexão restabelecida!', 'success', { durationMs: 3000 })
    }
    window.addEventListener('offline', onOff)
    window.addEventListener('online', onOn)
    return () => {
      window.removeEventListener('offline', onOff)
      window.removeEventListener('online', onOn)
    }
  }, [])

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    const val = parseFloat(amount.replace(',', '.'))
    if (!desc.trim() || !Number.isFinite(val) || val <= 0) {
      dispatchToast('Informe descrição e valor válido.', 'error')
      return
    }
    setSaving(true)
    try {
      const acctRes = await fetch(`${API_URL}/accounts`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!acctRes.ok) throw new Error('Conta não encontrada')
      const accts = await acctRes.json()
      const list = Array.isArray(accts) ? accts : accts.items || []
      const defAcct = list.find((a: { is_default?: boolean }) => a.is_default) || list[0]
      if (!defAcct) throw new Error('Crie uma conta em Contas antes de lançar.')

      const today = new Date()
      const isoDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const res = await fetch(`${API_URL}/transactions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account_id: defAcct.id,
          type: txType,
          amount: val,
          currency: 'BRL',
          description: desc.trim(),
          merchant_name: desc.trim(),
          transaction_date: isoDate,
          statement_month: isoDate.slice(0, 7),
          payment_method: paymentMethod,
          category_name: txType === 'income' ? 'Trabalho' : 'Outros',
        }),
      })
      if (!res.ok) throw new Error('Erro ao salvar lançamento')
      dispatchToast(`${txType === 'income' ? 'Entrada' : 'Gasto'} "${desc.trim()}" lançado!`, 'success')
      setDesc('')
      setAmount('')
      setSheetOpen(false)
      window.dispatchEvent(new Event('mony:transactions-updated'))
    } catch (err) {
      dispatchToast(err instanceof Error ? err.message : 'Erro ao lançar', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Subtle Offline Banner */}
      {offline && (
        <div
          role="alert"
          className="fixed top-2 left-1/2 -translate-x-1/2 z-[80] px-4 py-1.5 rounded-full bg-rose-600 text-white text-xs font-bold shadow-lg flex items-center gap-2 no-print"
        >
          <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
          Você está offline — reconectando...
        </div>
      )}

      {/* Mobile Floating Quick-Add FAB (+) */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Lançamento rápido"
        title="Lançamento rápido"
        className="lg:hidden fixed bottom-20 right-4 z-40 w-12 h-12 rounded-2xl text-white shadow-xl flex items-center justify-center transition-transform active:scale-95 no-print"
        style={{ background: 'var(--accent)' }}
      >
        <Plus className="w-6 h-6" aria-hidden="true" />
      </button>

      {/* Mobile Quick-Add Bottom Sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-[70] lg:hidden bg-slate-950/50 backdrop-blur-sm flex items-end justify-center no-print"
          role="dialog"
          aria-modal="true"
          onClick={() => setSheetOpen(false)}
        >
          <form
            onSubmit={handleQuickSubmit}
            onClick={(e) => e.stopPropagation()}
            className="glass-modal w-full rounded-b-none rounded-t-3xl p-5 pb-8 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" aria-hidden="true" />
                Lançamento Rápido
              </h3>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Fechar"
                className="p-1.5 rounded-xl text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTxType('expense')}
                className={`py-2 rounded-xl text-xs font-bold border transition ${
                  txType === 'expense'
                    ? 'bg-rose-500 text-white border-rose-500'
                    : 'bg-white/50 dark:bg-white/10 border-white/60 text-slate-700 dark:text-slate-200'
                }`}
              >
                - Saída / Gasto
              </button>
              <button
                type="button"
                onClick={() => setTxType('income')}
                className={`py-2 rounded-xl text-xs font-bold border transition ${
                  txType === 'income'
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-white/50 dark:bg-white/10 border-white/60 text-slate-700 dark:text-slate-200'
                }`}
              >
                + Entrada / Receita
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="R$ 0,00"
                className="col-span-2 input-base text-base font-extrabold text-right"
              />
              <input
                type="text"
                required
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Descrição (ex: Uber, Mercado...)"
                className="col-span-3 input-base text-sm"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  ['pix', 'PIX'],
                  ['credit_card', 'Cartão'],
                  ['debit_card', 'Débito'],
                  ['boleto', 'Boleto'],
                  ['cash', 'Dinheiro'],
                ] as const
              ).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setPaymentMethod(val)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                    paymentMethod === val
                      ? 'liquid-btn-primary border-transparent'
                      : 'bg-white/50 dark:bg-white/10 border-white/60 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full liquid-btn liquid-btn-primary py-3 rounded-2xl text-sm font-bold disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Confirmar Lançamento'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}

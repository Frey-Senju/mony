'use client'

import { LinkedAccount } from '@/lib/api/open-finance'

interface DisconnectModalProps {
  account: LinkedAccount | null
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export function DisconnectModal({ account, onConfirm, onCancel, loading }: DisconnectModalProps) {
  if (!account) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Desvincular conta
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Tem certeza que deseja desvincular a conta de{' '}
          <strong>{account.institution_name}</strong>
          {account.account_number_last4 && ` (•••• ${account.account_number_last4})`}?
          As transações históricas já importadas serão mantidas.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Removendo...' : 'Desvincular'}
          </button>
        </div>
      </div>
    </div>
  )
}

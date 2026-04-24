'use client'

import { LinkedAccount } from '@/lib/api/open-finance'

interface LinkedAccountCardProps {
  account: LinkedAccount
  onDisconnect: (account: LinkedAccount) => void
  loading?: boolean
}

export function LinkedAccountCard({ account, onDisconnect, loading }: LinkedAccountCardProps) {
  const statusColor = account.is_active
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'

  const statusLabel = account.is_active ? 'Conectado' : 'Inativo'

  return (
    <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {account.institution_name}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400 space-x-2">
          {account.account_type && <span>{account.account_type}</span>}
          {account.account_number_last4 && <span>•••• {account.account_number_last4}</span>}
          {account.owner_name && <span>— {account.owner_name}</span>}
        </div>
        {account.last_sync_at && (
          <div className="text-xs text-slate-400 dark:text-slate-500">
            Última sync: {new Date(account.last_sync_at).toLocaleDateString('pt-BR')}
          </div>
        )}
      </div>
      <button
        onClick={() => onDisconnect(account)}
        disabled={loading}
        className="px-3 py-2 text-sm text-red-600 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Removendo...' : 'Desvincular'}
      </button>
    </div>
  )
}

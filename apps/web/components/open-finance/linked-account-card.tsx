'use client'

import { LinkedAccount } from '@/lib/api/open-finance'

interface LinkedAccountCardProps {
  account: LinkedAccount
  onDisconnect: (account: LinkedAccount) => void
  onSync?: (account: LinkedAccount) => void
  loading?: boolean
  syncing?: boolean
}

export function LinkedAccountCard({
  account,
  onDisconnect,
  onSync,
  loading,
  syncing,
}: LinkedAccountCardProps) {
  const statusColor = account.is_active
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'

  const statusLabel = account.is_active ? 'Conectado' : 'Inativo'

  const syncBadge: Record<LinkedAccount['sync_status'], { label: string; cls: string }> = {
    idle: {
      label: 'Pronto para sync',
      cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    },
    syncing: {
      label: 'Sincronizando...',
      cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    },
    error: {
      label: 'Erro no último sync',
      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    },
  }

  const syncInfo = syncBadge[account.sync_status] || syncBadge.idle

  const formatLastSync = () => {
    if (!account.last_sync_at) return 'Nunca sincronizado'
    const dt = new Date(account.last_sync_at)
    return `Última sync: ${dt.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`
  }

  return (
    <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {account.institution_name}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
            {statusLabel}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${syncInfo.cls}`}>
            {syncInfo.label}
          </span>
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400 space-x-2">
          {account.account_type && <span>{account.account_type}</span>}
          {account.account_number_last4 && <span>•••• {account.account_number_last4}</span>}
          {account.owner_name && <span>— {account.owner_name}</span>}
        </div>
        <div className="text-xs text-slate-400 dark:text-slate-500">{formatLastSync()}</div>
        {account.sync_status === 'error' && account.last_sync_error && (
          <div className="text-xs text-amber-600 dark:text-amber-400">
            {account.last_sync_error}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onSync && (
          <button
            onClick={() => onSync(account)}
            disabled={syncing || loading}
            className="px-3 py-2 text-sm text-blue-600 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncing ? 'Sincronizando...' : 'Sync Now'}
          </button>
        )}
        <button
          onClick={() => onDisconnect(account)}
          disabled={loading}
          className="px-3 py-2 text-sm text-red-600 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Removendo...' : 'Desvincular'}
        </button>
      </div>
    </div>
  )
}

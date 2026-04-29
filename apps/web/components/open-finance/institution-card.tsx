'use client'

import { Institution } from '@/lib/api/open-finance'

interface InstitutionCardProps {
  institution: Institution
  onConnect: (institution: Institution) => void
  loading?: boolean
}

export function InstitutionCard({ institution, onConnect, loading }: InstitutionCardProps) {
  return (
    <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
      <div className="flex items-center gap-3">
        {institution.logo_url ? (
          <img
            src={institution.logo_url}
            alt={institution.name}
            className="w-10 h-10 object-contain rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="w-10 h-10 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-lg font-bold">
            {institution.name.charAt(0)}
          </div>
        )}
        <span className="font-medium text-slate-800 dark:text-slate-200">{institution.name}</span>
      </div>
      <button
        onClick={() => onConnect(institution)}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Conectando...' : 'Conectar'}
      </button>
    </div>
  )
}

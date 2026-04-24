'use client'

interface ConsentLoadingProps {
  institutionName?: string
}

export function ConsentLoading({ institutionName }: ConsentLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-slate-600 dark:text-slate-400 text-sm">
        {institutionName
          ? `Aguardando autorização no ${institutionName}...`
          : 'Processando autorização...'}
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Você será redirecionado automaticamente após autorizar.
      </p>
    </div>
  )
}

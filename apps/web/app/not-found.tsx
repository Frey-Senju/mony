import Link from 'next/link'
import { MonyLogo } from '@/components/brand/MonyLogo'

export default function NotFound() {
  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-panel max-w-md w-full p-8 text-center space-y-5">
        <div className="flex justify-center">
          <MonyLogo size="lg" showWordmark />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
            Erro 404
          </p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Página não encontrada
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            O endereço que você tentou acessar não existe ou foi movido.
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <Link
            href="/dashboard"
            className="liquid-btn liquid-btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}

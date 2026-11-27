import Link from 'next/link'
import { CheckCircle2, Lock } from 'lucide-react'
import { SignupForm } from '@/components/auth/SignupForm'
import { MonyLogo } from '@/components/brand/MonyLogo'

export const metadata = {
  title: 'Criar conta',
  description: 'Crie sua conta gratuita no Mony',
}

const PERKS = [
  'Importação instantânea de extratos CSV/OFX e Open Finance',
  'Previsão de saldo diário de 30, 60 e 90 dias com alerta de caixa',
  'Mony IA para categorização, auditoria de faturas e insights',
  'Exportação completa em Excel, PDF e backup JSON a qualquer hora',
]

export default function SignupPage() {
  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <aside className="hidden lg:flex lg:col-span-5 glass-panel p-8 flex-col justify-between bg-gradient-to-br from-emerald-500/12 via-blue-500/8 to-indigo-500/10">
          <div className="space-y-6">
            <Link href="/" className="inline-flex">
              <MonyLogo size="lg" showWordmark />
            </Link>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-snug">
                Comece hoje a construir sua liberdade financeira.
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Configuração em menos de 2 minutos, sem cartão de crédito obrigatório.
              </p>
            </div>
            <ul className="space-y-3 pt-1">
              {PERKS.map((perk) => (
                <li key={perk} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-6 border-t border-white/40 dark:border-white/10 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
              Conformidade LGPD
            </span>
            <div className="flex items-center gap-3">
              <Link href="/terms" className="hover:underline">Termos</Link>
              <Link href="/privacy" className="hover:underline">Privacidade</Link>
            </div>
          </div>
        </aside>

        <div className="lg:col-span-7 glass-panel p-7 sm:p-8 flex flex-col justify-center">
          <div className="mb-5">
            <Link href="/" className="inline-flex lg:hidden mb-4">
              <MonyLogo size="lg" showWordmark />
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Criar conta</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Comece a controlar seu patrimônio hoje mesmo
            </p>
          </div>

          <SignupForm />
        </div>
      </div>
    </main>
  )
}

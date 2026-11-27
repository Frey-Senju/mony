import Link from 'next/link'
import { ShieldCheck, Sparkles, TrendingUp, Lock } from 'lucide-react'
import { LoginForm } from '@/components/auth/LoginForm'
import { MonyLogo } from '@/components/brand/MonyLogo'

export const metadata = {
  title: 'Entrar',
  description: 'Acesse sua conta Mony',
}

const HIGHLIGHTS = [
  {
    icon: Sparkles,
    title: 'Mony IA & Planilha Inteligente',
    desc: 'Lançamentos em linguagem natural, auditoria de faturas e raio-x mensal automático.',
  },
  {
    icon: TrendingUp,
    title: 'Fluxo Diário, Metas & FIRE',
    desc: 'Previsão de caixa 90 dias, patrimônio líquido histórico e simuladores financeiros.',
  },
  {
    icon: ShieldCheck,
    title: 'Open Finance & Privacidade LGPD',
    desc: 'Conexão somente leitura, 2FA nativo e Modo Privacidade instantâneo (Shift+P).',
  },
]

export default function LoginPage() {
  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Feature Showcase (desktop) */}
        <aside className="hidden lg:flex lg:col-span-6 glass-panel p-8 flex-col justify-between bg-gradient-to-br from-blue-500/12 via-indigo-500/8 to-emerald-500/10">
          <div className="space-y-6">
            <Link href="/" className="inline-flex">
              <MonyLogo size="lg" showWordmark />
            </Link>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-snug">
                Seu painel financeiro pessoal com clareza absoluta.
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Contas, cartões, investimentos, dívidas e fluxo de caixa unidos em um só lugar.
              </p>
            </div>
            <ul className="space-y-4 pt-2">
              {HIGHLIGHTS.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.title} className="flex items-start gap-3">
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                      style={{ background: 'var(--accent)' }}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{item.desc}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="pt-6 border-t border-white/40 dark:border-white/10 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
              Criptografia TLS + Argon2
            </span>
            <div className="flex items-center gap-3">
              <Link href="/terms" className="hover:underline">Termos</Link>
              <Link href="/privacy" className="hover:underline">Privacidade</Link>
            </div>
          </div>
        </aside>

        {/* Right Login Form */}
        <div className="lg:col-span-6 glass-panel p-7 sm:p-8 flex flex-col justify-center">
          <div className="mb-6">
            <Link href="/" className="inline-flex lg:hidden mb-4">
              <MonyLogo size="lg" showWordmark />
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Entrar no Mony</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Organize suas finanças, faturas e investimentos com clareza
            </p>
          </div>

          <LoginForm />
        </div>
      </div>
    </main>
  )
}

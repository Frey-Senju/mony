'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Sparkles,
  Landmark,
  Radar,
  ShieldCheck,
  Users,
  Mic,
  TrendingUp,
  CheckCircle2,
  Plug,
} from 'lucide-react'
import { useAuth } from '@/stores/auth/useAuth'
import { MonyLogo } from '@/components/brand/MonyLogo'

const FEATURES = [
  {
    icon: Landmark,
    title: 'Open Finance + CSV/OFX Instantâneo',
    desc: 'Conecte 100+ bancos via Open Finance somente leitura ou arraste extratos CSV/OFX com anti-duplicata automático.',
  },
  {
    icon: Sparkles,
    title: 'Mony IA, Voz & Servidor MCP',
    desc: 'Lance gastos falando no microfone, pelo WhatsApp/Telegram ou conecte o Claude, ChatGPT e Cursor direto ao seu Mony.',
  },
  {
    icon: Radar,
    title: 'Mony Valuer · Preço Teto & B3',
    desc: 'Bazin, Graham, Gordon, 5 Radares B3 & BDRs, Mata-Mata até 12 ativos, Análise Técnica (MM/RSI), Bola de Neve e Backtest 12m.',
  },
  {
    icon: TrendingUp,
    title: 'Fluxo Diário 90d & Patrimônio',
    desc: 'Previsão de saldo dia a dia com alerta de vale de caixa, simulador "E se eu comprar X?" e evolução patrimonial.',
  },
  {
    icon: Users,
    title: 'Modo Casal, PJ/MEI (DRE) & KM',
    desc: 'Divisão de contas 50/50 ou proporcional à renda, DRE gerencial automático e relatórios de reembolso & quilometragem.',
  },
  {
    icon: ShieldCheck,
    title: 'Apple Liquid Glass + Privacidade',
    desc: 'Modo Privacidade instantâneo (Shift+P), 2FA nativo, backup JSON/Excel em 1 clique e conformidade total LGPD.',
  },
]

export default function Home() {
  const router = useRouter()
  const { isAuthenticated, loading } = useAuth()

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace('/dashboard')
    }
  }, [isAuthenticated, loading, router])

  if (loading || isAuthenticated) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="glass-panel px-10 py-8 flex flex-col items-center gap-4 text-center">
          <MonyLogo size="lg" showWordmark />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Carregando seu espaço financeiro...
          </p>
          <div className="w-36 h-1 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-blue-600 animate-pulse" />
          </div>
        </div>
      </main>
    )
  }

  return (
    <main id="main-content" className="min-h-screen px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Top Navbar */}
        <nav className="glass-panel px-5 py-3.5 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex">
            <MonyLogo size="md" showWordmark />
          </Link>
          <div className="flex items-center gap-2.5">
            <Link
              href="/auth/login"
              className="liquid-btn liquid-btn-glass px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold"
            >
              Entrar
            </Link>
            <Link
              href="/auth/signup"
              className="liquid-btn liquid-btn-primary px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5"
            >
              Criar Conta Grátis
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="glass-panel p-8 sm:p-12 text-center space-y-6 bg-gradient-to-br from-blue-500/12 via-indigo-500/8 to-emerald-500/10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-white/70 dark:bg-white/10 border border-white/60 dark:border-white/15 text-blue-700 dark:text-blue-300">
            <Sparkles className="w-3.5 h-3.5" />
            Open Finance · Mony IA + Voz + MCP · Valuer B3 · Modo Casal &amp; PJ
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight max-w-3xl mx-auto leading-tight">
            Todas as suas finanças, investimentos e metas com clareza absoluta.
          </h1>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
            O Mony reúne em um só lugar o controle diário inteligente, cartões e faturas, previsão de saldo de 90 dias,
            análise fundamentalista B3 (Bazin, Graham &amp; Gordon), finanças do casal e DRE para PJ/MEI.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/auth/signup"
              className="liquid-btn liquid-btn-primary px-7 py-3.5 rounded-2xl text-sm font-bold inline-flex items-center gap-2 shadow-lg"
            >
              Começar Agora Grátis
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/auth/login"
              className="liquid-btn liquid-btn-glass px-6 py-3.5 rounded-2xl text-sm font-semibold"
            >
              Já tenho conta
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-4 text-xs text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> 100+ Bancos Open Finance</span>
            <span className="inline-flex items-center gap-1.5"><Mic className="w-4 h-4 text-violet-500" /> Lançamento por Voz &amp; WhatsApp</span>
            <span className="inline-flex items-center gap-1.5"><Plug className="w-4 h-4 text-blue-500" /> Servidor MCP (Claude / ChatGPT)</span>
          </div>
        </section>

        {/* 6 Superpowers Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.title} className="glass-card p-6 space-y-3">
                <span
                  className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm"
                  style={{ background: 'var(--accent)' }}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">{f.title}</h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{f.desc}</p>
              </div>
            )
          })}
        </section>

        {/* Footer */}
        <footer className="glass-panel px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>© {new Date().getFullYear()} Mony · Gestão Financeira Inteligente</span>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:underline">Termos de Uso</Link>
            <Link href="/privacy" className="hover:underline">Política de Privacidade (LGPD)</Link>
            <Link href="/auth/login" className="hover:underline font-semibold text-blue-600 dark:text-blue-400">Acessar Painel →</Link>
          </div>
        </footer>
      </div>
    </main>
  )
}

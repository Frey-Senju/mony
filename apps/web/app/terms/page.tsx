import Link from 'next/link'
import { ArrowLeft, FileCheck2 } from 'lucide-react'
import { MonyLogo } from '@/components/brand/MonyLogo'

export const metadata = {
  title: 'Termos de Uso · Mony',
  description: 'Termos e condições de uso da plataforma financeira Mony',
}

export default function TermsPage() {
  return (
    <main id="main-content" className="min-h-screen px-4 py-12">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex">
            <MonyLogo size="md" showWordmark />
          </Link>
          <Link
            href="/auth/login"
            className="liquid-btn liquid-btn-glass px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar ao acesso
          </Link>
        </div>

        <article className="glass-panel p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <span
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shrink-0"
              style={{ background: 'var(--accent)' }}
            >
              <FileCheck2 className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Termos e Condições de Uso
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Última atualização: Novembro de 2026 · Mony Gestão Financeira
              </p>
            </div>
          </div>

          <section className="space-y-2 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">1. Objeto do Serviço</h2>
            <p>
              O Mony oferece ferramentas digitais para organização financeira pessoal, controle de receitas e despesas,
              consolidação de contas via Open Finance, planejamento de metas, gestão de investimentos e simulações
              educacionais. O Mony não presta consultoria de valores mobiliários nem executa ordens bancárias.
            </p>
          </section>

          <section className="space-y-2 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">2. Conta, Segurança e 2FA</h2>
            <p>
              Você é responsável por manter suas credenciais confidenciais. Recomendamos ativar a Autenticação em Dois
              Fatores (2FA) em <strong>Configurações → Perfil</strong> e utilizar o Modo Privacidade (<code>Shift+P</code>)
              ao acessar o Mony em locais públicos.
            </p>
          </section>

          <section className="space-y-2 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">3. Open Finance e Importações</h2>
            <p>
              As conexões bancárias utilizam consentimento explícito em modo somente leitura via provedores regulados
              (Open Finance Brasil). Você pode revogar qualquer conexão ou exportar seu backup completo em JSON/Excel a
              qualquer momento.
            </p>
          </section>

          <section className="space-y-2 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">4. Propriedade dos Dados</h2>
            <p>
              Todos os dados financeiros cadastrados pertencem exclusivamente a você. O encerramento ou exportação dos
              dados pode ser realizado diretamente pelo painel de configurações sem burocracia.
            </p>
          </section>
        </article>
      </div>
    </main>
  )
}

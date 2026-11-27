import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { MonyLogo } from '@/components/brand/MonyLogo'

export const metadata = {
  title: 'Política de Privacidade · Mony',
  description: 'Como o Mony protege seus dados financeiros em conformidade com a LGPD',
}

export default function PrivacyPage() {
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
            <span className="w-10 h-10 rounded-2xl flex items-center justify-center bg-emerald-600 text-white shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Política de Privacidade &amp; LGPD
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lei nº 13.709/2018 (LGPD) · Transparência e segurança ponta a ponta
              </p>
            </div>
          </div>

          <section className="space-y-2 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">1. Dados Coletados</h2>
            <p>
              Coletamos apenas os dados necessários para operar sua organização financeira: nome, e-mail, contas,
              lançamentos, categorias, metas, investimentos e conexões Open Finance explicitamente autorizadas por você.
            </p>
          </section>

          <section className="space-y-2 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">2. Criptografia &amp; Isolamento</h2>
            <p>
              Todas as comunicações trafegam via HTTPS/TLS, senhas utilizam hash criptográfico Argon2 e cada registro é
              isolado estritamente ao seu identificador de usuário no banco de dados PostgreSQL. Nunca vendemos,
              alugamos ou compartilhamos dados financeiros com anunciantes.
            </p>
          </section>

          <section className="space-y-2 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">3. Seus Direitos (LGPD)</h2>
            <p>
              Você pode, a qualquer momento, exportar integralmente seus dados em formato JSON ou Excel em{' '}
              <strong>Configurações → Perfil</strong>, revogar consentimentos Open Finance em{' '}
              <strong>Configurações → Conexões</strong> e solicitar a exclusão definitiva de sua conta.
            </p>
          </section>
        </article>
      </div>
    </main>
  )
}

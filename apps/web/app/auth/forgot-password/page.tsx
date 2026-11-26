import Link from 'next/link'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { MonyLogo } from '@/components/brand/MonyLogo'

export const metadata = {
  title: 'Recuperar senha',
  description: 'Redefina a senha da sua conta Mony',
}

export default function ForgotPasswordPage() {
  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="glass-panel p-8 w-full max-w-md">
        <div className="mb-8">
          <Link href="/" className="inline-flex">
            <MonyLogo size="lg" showWordmark />
          </Link>
          <h1 className="mt-5 text-2xl font-bold text-slate-900 dark:text-white">Recuperar senha</h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
            Enviaremos um link para redefinir sua senha com segurança
          </p>
        </div>

        <ForgotPasswordForm />
      </div>
    </main>
  )
}

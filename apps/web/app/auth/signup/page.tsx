import Link from 'next/link'
import { SignupForm } from '@/components/auth/SignupForm'
import { MonyLogo } from '@/components/brand/MonyLogo'

export const metadata = {
  title: 'Criar conta',
  description: 'Crie sua conta gratuita no Mony',
}

export default function SignupPage() {
  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="glass-panel p-8 w-full max-w-md">
        <div className="mb-8">
          <Link href="/" className="inline-flex">
            <MonyLogo size="lg" showWordmark />
          </Link>
          <h1 className="mt-5 text-2xl font-bold text-slate-900 dark:text-white">Criar conta</h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
            Comece a controlar seu patrimônio hoje mesmo
          </p>
        </div>

        <SignupForm />
      </div>
    </main>
  )
}

import Link from 'next/link'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Sign In',
  description: 'Sign in to your Mony account',
}

export default function LoginPage() {
  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="glass-panel p-8 w-full max-w-md">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 text-2xl font-bold text-slate-900 dark:text-white">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-base font-extrabold shadow-sm"
              style={{ background: 'var(--accent)' }}
              aria-hidden="true"
            >
              M
            </span>
            <span>Mony</span>
          </Link>
          <h1 className="mt-5 text-2xl font-bold text-slate-900 dark:text-white">Sign in</h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
            Manage your finances with ease
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  )
}

import Link from 'next/link'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { MonyLogo } from '@/components/brand/MonyLogo'

export const metadata = {
  title: 'Reset Password',
  description: 'Reset your Mony account password',
}

export default function ForgotPasswordPage() {
  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="glass-panel p-8 w-full max-w-md">
        <div className="mb-8">
          <Link href="/" className="inline-flex">
            <MonyLogo size="lg" showWordmark />
          </Link>
          <h1 className="mt-5 text-2xl font-bold text-slate-900 dark:text-white">Reset password</h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
            We&apos;ll send you a link to reset your password
          </p>
        </div>

        <ForgotPasswordForm />
      </div>
    </main>
  )
}

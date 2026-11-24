import Link from 'next/link'
import { TwoFASetup } from '@/components/auth/TwoFASetup'

export const metadata = {
  title: 'Enable 2FA',
  description: 'Enable two-factor authentication on your Mony account',
}

export default function Verify2FAPage() {
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
        </div>

        <TwoFASetup />
      </div>
    </main>
  )
}

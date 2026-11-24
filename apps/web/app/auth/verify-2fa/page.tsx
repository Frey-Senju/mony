import Link from 'next/link'
import { TwoFASetup } from '@/components/auth/TwoFASetup'
import { MonyLogo } from '@/components/brand/MonyLogo'

export const metadata = {
  title: 'Enable 2FA',
  description: 'Enable two-factor authentication on your Mony account',
}

export default function Verify2FAPage() {
  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="glass-panel p-8 w-full max-w-md">
        <div className="mb-8">
          <Link href="/" className="inline-flex">
            <MonyLogo size="lg" showWordmark />
          </Link>
        </div>

        <TwoFASetup />
      </div>
    </main>
  )
}

/**
 * 2FA setup page for Mony app.
 */

import Link from 'next/link'
import { TwoFASetup } from '@/components/auth/TwoFASetup'

export const metadata = {
  title: 'Enable 2FA - Mony',
  description: 'Enable two-factor authentication on your Mony account',
}

export default function Verify2FAPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-2xl font-bold text-blue-600">
            Mony
          </Link>
        </div>

        {/* 2FA setup form */}
        <TwoFASetup />
      </div>
    </div>
  )
}

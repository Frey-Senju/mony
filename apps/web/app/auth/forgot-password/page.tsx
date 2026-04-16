/**
 * Forgot password page for Mony app.
 */

import Link from 'next/link'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'

export const metadata = {
  title: 'Reset Password - Mony',
  description: 'Reset your Mony account password',
}

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-2xl font-bold text-blue-600">
            Mony
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Reset password</h1>
          <p className="mt-2 text-gray-600">
            We'll send you a link to reset your password
          </p>
        </div>

        {/* Password reset form */}
        <ForgotPasswordForm />
      </div>
    </div>
  )
}

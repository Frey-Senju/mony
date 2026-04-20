/**
 * Login page for Mony app.
 */

import Link from 'next/link'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata = {
  title: 'Sign In - Mony',
  description: 'Sign in to your Mony account',
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-2xl font-bold text-blue-600">
            Mony
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Sign in</h1>
          <p className="mt-2 text-gray-600">
            Manage your finances with ease
          </p>
        </div>

        {/* Login form */}
        <LoginForm />
      </div>
    </div>
  )
}

/**
 * Signup page for Mony app.
 */

import Link from 'next/link'
import { SignupForm } from '@/components/auth/SignupForm'

export const metadata = {
  title: 'Create Account - Mony',
  description: 'Create your Mony account',
}

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-2xl font-bold text-blue-600">
            Mony
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Create account</h1>
          <p className="mt-2 text-gray-600">
            Start managing your finances today
          </p>
        </div>

        {/* Signup form */}
        <SignupForm />
      </div>
    </div>
  )
}

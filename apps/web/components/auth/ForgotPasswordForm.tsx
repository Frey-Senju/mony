/**
 * ForgotPasswordForm component for password reset request.
 *
 * Step 1: User enters email to request reset token.
 * Token is sent to email (handled by backend).
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/stores/auth/useAuth'

export interface ForgotPasswordFormProps {
  onSuccess?: () => void
}

export const ForgotPasswordForm = ({ onSuccess }: ForgotPasswordFormProps) => {
  const { requestPasswordReset, loading, error } = useAuth()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const validateForm = () => {
    const errors: Record<string, string> = {}

    if (!email) {
      errors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Invalid email format'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    try {
      await requestPasswordReset(email)
      setSubmitted(true)
      onSuccess?.()
    } catch (err) {
      // Error is handled by useAuth hook
    }
  }

  if (submitted) {
    return (
      <div className="space-y-6 text-center">
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700">
            Check your email for password reset instructions. Link expires in 24 hours.
          </p>
        </div>

        <Link href="/auth/login" className="text-blue-600 hover:underline">
          Back to login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-gray-600 text-sm">
        Enter your email address and we'll send you a link to reset your password.
      </p>

      {/* Email field */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email address
        </label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          className={`mt-2 w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
            validationErrors.email ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="you@example.com"
        />
        {validationErrors.email && (
          <p className="mt-1 text-sm text-red-500">{validationErrors.email}</p>
        )}
      </div>

      {/* API error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Sending...' : 'Send reset link'}
      </button>

      {/* Link to login */}
      <div className="text-center text-sm">
        Remember your password?{' '}
        <Link href="/auth/login" className="text-blue-600 hover:underline">
          Sign in
        </Link>
      </div>
    </form>
  )
}

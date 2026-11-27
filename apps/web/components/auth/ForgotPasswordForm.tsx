/**
 * ForgotPasswordForm component for password reset request.
 * EPIC-010: Upgraded to 100% Apple Liquid Glass + Dark Mode.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, CheckCircle2, ArrowRight } from 'lucide-react'
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
    } catch {
      // Error is handled by useAuth hook
    }
  }

  if (submitted) {
    return (
      <div className="space-y-5 text-center">
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-400/40 flex flex-col items-center gap-2">
          <CheckCircle2 className="w-7 h-7 text-emerald-500" aria-hidden="true" />
          <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
            Check your email for password reset instructions. Link expires in 24 hours.
          </p>
        </div>

        <Link
          href="/auth/login"
          className="inline-block text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          Back to login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
        Enter your email address and we&apos;ll send you a link to reset your password.
      </p>

      {/* Email field */}
      <div>
        <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Email address
        </label>
        <div className="relative mt-1.5">
          <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            type="email"
            id="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className={`liquid-input w-full pl-10 pr-4 py-2.5 text-sm disabled:opacity-60 ${
              validationErrors.email ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
            }`}
            placeholder="voce@exemplo.com"
          />
        </div>
        {validationErrors.email && (
          <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">{validationErrors.email}</p>
        )}
      </div>

      {/* API error */}
      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-400/40">
          <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={loading}
        className="liquid-btn liquid-btn-primary w-full py-2.5 px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span>{loading ? 'Sending...' : 'Send reset link'}</span>
        {!loading && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
      </button>

      {/* Link to login */}
      <div className="text-center text-xs text-slate-600 dark:text-slate-300">
        Remember your password?{' '}
        <Link href="/auth/login" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          Sign in
        </Link>
      </div>
    </form>
  )
}

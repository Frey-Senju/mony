/**
 * SignupForm component for user registration.
 * EPIC-010: Upgraded to 100% Apple Liquid Glass + Dark Mode + Show/Hide password + Strength meter.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Lock, Mail, User, ArrowRight } from 'lucide-react'
import { useAuth } from '@/stores/auth/useAuth'

export interface SignupFormProps {
  onSuccess?: () => void
}

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 8) score += 1
  if (/[A-Z]/.test(pw)) score += 1
  if (/[0-9]/.test(pw)) score += 1
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) score += 1
  const map = [
    { label: 'Muito fraca', color: 'bg-rose-500' },
    { label: 'Fraca', color: 'bg-amber-500' },
    { label: 'Boa', color: 'bg-blue-500' },
    { label: 'Forte', color: 'bg-emerald-500' },
    { label: 'Excelente', color: 'bg-emerald-500' },
  ]
  return { score, ...map[score] }
}

export const SignupForm = ({ onSuccess }: SignupFormProps) => {
  const { register, loading, error } = useAuth()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const strength = getPasswordStrength(password)

  const validateForm = () => {
    const errors: Record<string, string> = {}

    if (!fullName.trim()) {
      errors.fullName = 'Full name is required'
    }

    if (!email) {
      errors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Invalid email format'
    }

    if (!password) {
      errors.password = 'Password is required'
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters'
    } else if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      errors.password = 'Password must contain uppercase letter and number'
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }

    if (!agreedToTerms) {
      errors.terms = 'You must agree to terms and conditions'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    try {
      await register(email, password, fullName)
      onSuccess?.()
    } catch {
      // Error is handled by useAuth hook
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {/* Full name field */}
      <div>
        <label htmlFor="fullName" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Full name
        </label>
        <div className="relative mt-1.5">
          <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            id="fullName"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={loading}
            className={`liquid-input w-full pl-10 pr-4 py-2.5 text-sm disabled:opacity-60 ${
              validationErrors.fullName ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
            }`}
            placeholder="João Silva"
          />
        </div>
        {validationErrors.fullName && (
          <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{validationErrors.fullName}</p>
        )}
      </div>

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
          <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{validationErrors.email}</p>
        )}
      </div>

      {/* Password field */}
      <div>
        <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Password
        </label>
        <div className="relative mt-1.5">
          <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            type={showPassword ? 'text' : 'password'}
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className={`liquid-input w-full pl-10 pr-10 py-2.5 text-sm disabled:opacity-60 ${
              validationErrors.password ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
            }`}
            placeholder="••••••••"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Live Password Strength Meter */}
        {password.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="grid grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((seg) => (
                <div
                  key={seg}
                  className={`h-1 rounded-full transition-all ${
                    strength.score >= seg ? strength.color : 'bg-slate-200 dark:bg-white/10'
                  }`}
                />
              ))}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Força da senha: <strong className="text-slate-700 dark:text-slate-200">{strength.label}</strong>
            </p>
          </div>
        )}

        {validationErrors.password && (
          <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{validationErrors.password}</p>
        )}
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          Must contain uppercase letter, number, at least 8 characters
        </p>
      </div>

      {/* Confirm password field */}
      <div>
        <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Confirm password
        </label>
        <div className="relative mt-1.5">
          <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            type={showPassword ? 'text' : 'password'}
            id="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            className={`liquid-input w-full pl-10 pr-4 py-2.5 text-sm disabled:opacity-60 ${
              validationErrors.confirmPassword ? '!border-rose-500 ring-1 ring-rose-500/40' : ''
            }`}
            placeholder="••••••••"
          />
        </div>
        {validationErrors.confirmPassword && (
          <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{validationErrors.confirmPassword}</p>
        )}
      </div>

      {/* Terms checkbox */}
      <div>
        <div className="flex items-start">
          <input
            type="checkbox"
            id="terms"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            disabled={loading}
            className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-white/20 text-blue-600"
          />
          <label htmlFor="terms" className="ml-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            I agree to{' '}
            <Link href="/terms" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              Terms and Conditions
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              Privacy Policy
            </Link>
          </label>
        </div>
        {validationErrors.terms && (
          <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{validationErrors.terms}</p>
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
        <span>{loading ? 'Creating account...' : 'Create account'}</span>
        {!loading && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
      </button>

      {/* Link to login */}
      <div className="text-center text-xs text-slate-600 dark:text-slate-300 pt-1">
        Already have an account?{' '}
        <Link href="/auth/login" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          Sign in
        </Link>
      </div>
    </form>
  )
}

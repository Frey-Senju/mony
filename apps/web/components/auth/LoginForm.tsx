/**
 * LoginForm component for user authentication.
 * EPIC-010: Upgraded to 100% Apple Liquid Glass + Dark Mode + Show/Hide password toggle.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Lock, Mail, ArrowRight } from 'lucide-react'
import { useAuth } from '@/stores/auth/useAuth'

export interface LoginFormProps {
  onSuccess?: () => void
}

export const LoginForm = ({ onSuccess }: LoginFormProps) => {
  const { login, loading, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const validateForm = () => {
    const errors: Record<string, string> = {}

    if (!email) {
      errors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Invalid email format'
    }

    if (!password) {
      errors.password = 'Password is required'
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    try {
      await login(email, password)
      onSuccess?.()
    } catch {
      // Error is handled by useAuth hook
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
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
            autoComplete="current-password"
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
        {validationErrors.password && (
          <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">{validationErrors.password}</p>
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
        <span>{loading ? 'Signing in...' : 'Sign in'}</span>
        {!loading && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
      </button>

      {/* Links */}
      <div className="flex items-center justify-between text-xs pt-1">
        <Link href="/auth/forgot-password" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
          Forgot password?
        </Link>
        <Link href="/auth/signup" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          Create account
        </Link>
      </div>
    </form>
  )
}

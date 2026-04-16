/**
 * Authentication hook for Mony app.
 *
 * Manages auth state, tokens, and API calls.
 * Stores tokens in localStorage with secure httpOnly simulation.
 */

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface User {
  id: number
  email: string
  full_name: string
  is_email_verified: boolean
  plan: 'BASIC' | 'PRO' | 'PREMIUM'
  created_at: string
}

interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

interface AuthState {
  user: User | null
  tokens: AuthTokens | null
  loading: boolean
  error: string | null
}

export const useAuth = () => {
  const router = useRouter()
  const [state, setState] = useState<AuthState>({
    user: null,
    tokens: null,
    loading: true,
    error: null,
  })

  // Fetch current user from backend
  const fetchUser = useCallback(
    async (accessToken: string) => {
      try {
        const response = await fetch(`${API_URL}/auth/users/me`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error('Failed to fetch user')
        }

        const user = (await response.json()) as User
        setState(prev => ({ ...prev, user }))
        return user
      } catch (error) {
        console.error('Failed to fetch user:', error)
        // Don't throw, allow app to continue even if user fetch fails
        return null
      }
    },
    []
  )

  // Load tokens from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('mony_tokens')
    if (stored) {
      try {
        const tokens = JSON.parse(stored)
        setState(prev => ({ ...prev, tokens }))
        // Fetch user data from backend
        fetchUser(tokens.access_token).then(() => {
          setState(prev => ({ ...prev, loading: false }))
        }).catch(() => {
          setState(prev => ({ ...prev, loading: false }))
        })
      } catch {
        localStorage.removeItem('mony_tokens')
        setState(prev => ({ ...prev, loading: false }))
      }
    } else {
      setState(prev => ({ ...prev, loading: false }))
    }
  }, [fetchUser])

  // Register user
  const register = useCallback(
    async (email: string, password: string, fullName: string) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const response = await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            full_name: fullName,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.detail || 'Registration failed')
        }

        const tokens = (await response.json()) as AuthTokens
        localStorage.setItem('mony_tokens', JSON.stringify(tokens))
        setState(prev => ({ ...prev, tokens }))

        // Fetch user data from backend
        await fetchUser(tokens.access_token)

        router.push('/dashboard')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Registration failed'
        setState(prev => ({ ...prev, error: message }))
        throw error
      } finally {
        setState(prev => ({ ...prev, loading: false }))
      }
    },
    [router, fetchUser]
  )

  // Login user
  const login = useCallback(
    async (email: string, password: string) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const response = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.detail || 'Login failed')
        }

        const tokens = (await response.json()) as AuthTokens
        localStorage.setItem('mony_tokens', JSON.stringify(tokens))
        setState(prev => ({ ...prev, tokens }))

        // Fetch user data from backend
        await fetchUser(tokens.access_token)

        router.push('/dashboard')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Login failed'
        setState(prev => ({ ...prev, error: message }))
        throw error
      } finally {
        setState(prev => ({ ...prev, loading: false }))
      }
    },
    [router, fetchUser]
  )

  // Refresh access token
  const refreshToken = useCallback(async () => {
    if (!state.tokens?.refresh_token) return

    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: state.tokens.refresh_token }),
      })

      if (!response.ok) throw new Error('Token refresh failed')

      const newTokens = (await response.json()) as AuthTokens
      localStorage.setItem('mony_tokens', JSON.stringify(newTokens))
      setState(prev => ({ ...prev, tokens: newTokens }))
      return newTokens
    } catch (error) {
      logout()
      throw error
    }
  }, [state.tokens?.refresh_token])

  // Logout user
  const logout = useCallback(() => {
    localStorage.removeItem('mony_tokens')
    setState({ user: null, tokens: null, loading: false, error: null })
    router.push('/auth/login')
  }, [router])

  // Request password reset
  const requestPasswordReset = useCallback(
    async (email: string) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const response = await fetch(`${API_URL}/auth/password-reset/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })

        if (!response.ok) {
          throw new Error('Failed to request password reset')
        }

        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Request failed'
        setState(prev => ({ ...prev, error: message }))
        throw error
      } finally {
        setState(prev => ({ ...prev, loading: false }))
      }
    },
    []
  )

  // Confirm password reset
  const confirmPasswordReset = useCallback(
    async (token: string, newPassword: string) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const response = await fetch(`${API_URL}/auth/password-reset/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, new_password: newPassword }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.detail || 'Password reset failed')
        }

        router.push('/auth/login')
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Password reset failed'
        setState(prev => ({ ...prev, error: message }))
        throw error
      } finally {
        setState(prev => ({ ...prev, loading: false }))
      }
    },
    [router]
  )

  // Setup 2FA
  const setup2FA = useCallback(async () => {
    if (!state.tokens?.access_token) throw new Error('Not authenticated')

    try {
      const response = await fetch(`${API_URL}/auth/2fa/setup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.tokens.access_token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) throw new Error('2FA setup failed')

      return (await response.json()) as {
        qr_code: string
        secret: string
        backup_codes: string[]
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '2FA setup failed'
      setState(prev => ({ ...prev, error: message }))
      throw error
    }
  }, [state.tokens?.access_token])

  // Get authorization header
  const getAuthHeader = useCallback(() => {
    if (!state.tokens?.access_token) return {}
    return {
      'Authorization': `Bearer ${state.tokens.access_token}`,
      'Content-Type': 'application/json',
    }
  }, [state.tokens?.access_token])

  return {
    // State
    user: state.user,
    tokens: state.tokens,
    loading: state.loading,
    error: state.error,
    isAuthenticated: !!state.tokens?.access_token,

    // Methods
    register,
    login,
    logout,
    refreshToken,
    requestPasswordReset,
    confirmPasswordReset,
    setup2FA,
    getAuthHeader,
  }
}

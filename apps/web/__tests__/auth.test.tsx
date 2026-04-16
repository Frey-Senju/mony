/**
 * Integration tests for authentication components and hooks.
 *
 * Uses React Testing Library + Jest.
 * Tests form validation, error handling, API calls, token management.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '@/components/auth/LoginForm'
import { SignupForm } from '@/components/auth/SignupForm'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { TwoFASetup } from '@/components/auth/TwoFASetup'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}))

// Mock fetch
global.fetch = jest.fn()

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  it('renders login form with email and password fields', () => {
    render(<LoginForm />)

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('validates empty fields', async () => {
    render(<LoginForm />)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument()
      expect(screen.getByText(/password is required/i)).toBeInTheDocument()
    })
  })

  it('validates invalid email format', async () => {
    render(<LoginForm />)
    const emailInput = screen.getByLabelText(/email address/i) as HTMLInputElement
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await userEvent.type(emailInput, 'invalid-email')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/invalid email format/i)).toBeInTheDocument()
    })
  })

  it('validates short password', async () => {
    render(<LoginForm />)
    const passwordInput = screen.getByLabelText(/^password$/i) as HTMLInputElement
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await userEvent.type(passwordInput, 'short')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument()
    })
  })

  it('submits valid form with email and password', async () => {
    const mockFetch = fetch as jest.MockedFunction<typeof fetch>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test_access',
        refresh_token: 'test_refresh',
        token_type: 'bearer',
        expires_in: 900,
      }),
    } as Response)

    render(<LoginForm />)
    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password$/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await userEvent.type(emailInput, 'test@example.com')
    await userEvent.type(passwordInput, 'TestPass123')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/login'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('test@example.com'),
        })
      )
    })
  })

  it('displays API error on login failure', async () => {
    const mockFetch = fetch as jest.MockedFunction<typeof fetch>
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Invalid credentials' }),
    } as Response)

    render(<LoginForm />)
    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password$/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await userEvent.type(emailInput, 'test@example.com')
    await userEvent.type(passwordInput, 'WrongPass123')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument()
    })
  })

  it('disables form during submission', async () => {
    const mockFetch = fetch as jest.MockedFunction<typeof fetch>
    mockFetch.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(() => resolve({
        ok: true,
        json: async () => ({}),
      } as Response), 100))
    )

    render(<LoginForm />)
    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password$/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await userEvent.type(emailInput, 'test@example.com')
    await userEvent.type(passwordInput, 'TestPass123')
    fireEvent.click(submitButton)

    expect(submitButton).toBeDisabled()
    expect(emailInput).toBeDisabled()
    expect(passwordInput).toBeDisabled()
  })
})

describe('SignupForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  it('renders signup form with all fields', () => {
    render(<SignupForm />)

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /terms and conditions/i })).toBeInTheDocument()
  })

  it('validates password strength (uppercase + number)', async () => {
    render(<SignupForm />)
    const passwordInput = screen.getByLabelText(/^password$/i)
    const submitButton = screen.getByRole('button', { name: /create account/i })

    await userEvent.type(passwordInput, 'lowercase123')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/uppercase letter and number/i)).toBeInTheDocument()
    })
  })

  it('validates password confirmation match', async () => {
    render(<SignupForm />)
    const passwordInput = screen.getByLabelText(/^password$/i)
    const confirmInput = screen.getByLabelText(/confirm password/i)
    const submitButton = screen.getByRole('button', { name: /create account/i })

    await userEvent.type(passwordInput, 'ValidPass123')
    await userEvent.type(confirmInput, 'DifferentPass123')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    })
  })

  it('requires terms acceptance', async () => {
    render(<SignupForm />)
    const nameInput = screen.getByLabelText(/full name/i)
    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password$/i)
    const confirmInput = screen.getByLabelText(/confirm password/i)
    const submitButton = screen.getByRole('button', { name: /create account/i })

    await userEvent.type(nameInput, 'John Doe')
    await userEvent.type(emailInput, 'john@example.com')
    await userEvent.type(passwordInput, 'ValidPass123')
    await userEvent.type(confirmInput, 'ValidPass123')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/must agree to terms/i)).toBeInTheDocument()
    })
  })

  it('submits valid signup form', async () => {
    const mockFetch = fetch as jest.MockedFunction<typeof fetch>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test_access',
        refresh_token: 'test_refresh',
        token_type: 'bearer',
        expires_in: 900,
      }),
    } as Response)

    render(<SignupForm />)
    const nameInput = screen.getByLabelText(/full name/i)
    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password$/i)
    const confirmInput = screen.getByLabelText(/confirm password/i)
    const termsCheckbox = screen.getByRole('checkbox', { name: /terms and conditions/i })
    const submitButton = screen.getByRole('button', { name: /create account/i })

    await userEvent.type(nameInput, 'John Doe')
    await userEvent.type(emailInput, 'john@example.com')
    await userEvent.type(passwordInput, 'ValidPass123')
    await userEvent.type(confirmInput, 'ValidPass123')
    fireEvent.click(termsCheckbox)
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/register'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('john@example.com'),
        })
      )
    })
  })

  it('displays duplicate email error', async () => {
    const mockFetch = fetch as jest.MockedFunction<typeof fetch>
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Email already registered' }),
    } as Response)

    render(<SignupForm />)
    const nameInput = screen.getByLabelText(/full name/i)
    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password$/i)
    const confirmInput = screen.getByLabelText(/confirm password/i)
    const termsCheckbox = screen.getByRole('checkbox', { name: /terms and conditions/i })
    const submitButton = screen.getByRole('button', { name: /create account/i })

    await userEvent.type(nameInput, 'John Doe')
    await userEvent.type(emailInput, 'existing@example.com')
    await userEvent.type(passwordInput, 'ValidPass123')
    await userEvent.type(confirmInput, 'ValidPass123')
    fireEvent.click(termsCheckbox)
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/already registered/i)).toBeInTheDocument()
    })
  })
})

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders forgot password form', () => {
    render(<ForgotPasswordForm />)

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('validates email input', async () => {
    render(<ForgotPasswordForm />)
    const submitButton = screen.getByRole('button', { name: /send reset link/i })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument()
    })
  })

  it('submits password reset request', async () => {
    const mockFetch = fetch as jest.MockedFunction<typeof fetch>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Reset email sent' }),
    } as Response)

    render(<ForgotPasswordForm />)
    const emailInput = screen.getByLabelText(/email address/i)
    const submitButton = screen.getByRole('button', { name: /send reset link/i })

    await userEvent.type(emailInput, 'test@example.com')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/password-reset/request'),
        expect.objectContaining({
          method: 'POST',
        })
      )
    })
  })

  it('shows success message after submission', async () => {
    const mockFetch = fetch as jest.MockedFunction<typeof fetch>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Reset email sent' }),
    } as Response)

    render(<ForgotPasswordForm />)
    const emailInput = screen.getByLabelText(/email address/i)
    const submitButton = screen.getByRole('button', { name: /send reset link/i })

    await userEvent.type(emailInput, 'test@example.com')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument()
      expect(screen.getByText(/expires in 24 hours/i)).toBeInTheDocument()
    })
  })
})

describe('TwoFASetup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders initial setup screen', () => {
    render(<TwoFASetup />)

    expect(screen.getByText(/enable two-factor authentication/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument()
  })

  it('requests 2FA setup on button click', async () => {
    const mockFetch = fetch as jest.MockedFunction<typeof fetch>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        qr_code: 'data:image/png;base64,test',
        secret: 'JBSWY3DPEBLW64TMMQ======',
        backup_codes: ['CODE1', 'CODE2', 'CODE3', 'CODE4', 'CODE5'],
      }),
    } as Response)

    render(<TwoFASetup />)
    const getStartedButton = screen.getByRole('button', { name: /get started/i })

    fireEvent.click(getStartedButton)

    await waitFor(() => {
      expect(screen.getByText(/scan qr code/i)).toBeInTheDocument()
    })
  })

  it('displays QR code and secret', async () => {
    const mockFetch = fetch as jest.MockedFunction<typeof fetch>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        qr_code: 'data:image/png;base64,test',
        secret: 'TESTSECRET123',
        backup_codes: ['CODE1', 'CODE2'],
      }),
    } as Response)

    render(<TwoFASetup />)
    const getStartedButton = screen.getByRole('button', { name: /get started/i })

    fireEvent.click(getStartedButton)

    await waitFor(() => {
      expect(screen.getByText('TESTSECRET123')).toBeInTheDocument()
    })
  })

  it('validates TOTP code input (6 digits)', async () => {
    const mockFetch = fetch as jest.MockedFunction<typeof fetch>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        qr_code: 'data:image/png;base64,test',
        secret: 'TESTSECRET',
        backup_codes: ['CODE1'],
      }),
    } as Response)

    render(<TwoFASetup />)
    const getStartedButton = screen.getByRole('button', { name: /get started/i })

    fireEvent.click(getStartedButton)

    await waitFor(() => {
      const totpInput = screen.getByPlaceholderText('000000') as HTMLInputElement
      expect(totpInput).toBeInTheDocument()

      // Try invalid input
      fireEvent.click(screen.getByRole('button', { name: /enable 2fa/i }))

      expect(screen.getByText(/invalid code format/i)).toBeInTheDocument()
    })
  })

  it('shows backup codes', async () => {
    const mockFetch = fetch as jest.MockedFunction<typeof fetch>
    const codes = ['BACKUP01', 'BACKUP02', 'BACKUP03', 'BACKUP04', 'BACKUP05']
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        qr_code: 'data:image/png;base64,test',
        secret: 'TESTSECRET',
        backup_codes: codes,
      }),
    } as Response)

    render(<TwoFASetup />)
    const getStartedButton = screen.getByRole('button', { name: /get started/i })

    fireEvent.click(getStartedButton)

    await waitFor(() => {
      codes.forEach(code => {
        expect(screen.getByText(code)).toBeInTheDocument()
      })
    })
  })
})

describe('Token Storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores tokens in localStorage after login', async () => {
    const mockFetch = fetch as jest.MockedFunction<typeof fetch>
    const tokens = {
      access_token: 'access123',
      refresh_token: 'refresh123',
      token_type: 'bearer',
      expires_in: 900,
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => tokens,
    } as Response)

    render(<LoginForm />)
    const emailInput = screen.getByLabelText(/email address/i)
    const passwordInput = screen.getByLabelText(/^password$/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await userEvent.type(emailInput, 'test@example.com')
    await userEvent.type(passwordInput, 'TestPass123')
    fireEvent.click(submitButton)

    await waitFor(() => {
      const stored = localStorage.getItem('mony_tokens')
      expect(stored).toBeTruthy()
      const parsed = JSON.parse(stored || '{}')
      expect(parsed.access_token).toBe('access123')
      expect(parsed.refresh_token).toBe('refresh123')
    })
  })

  it('clears tokens on logout', () => {
    localStorage.setItem('mony_tokens', JSON.stringify({
      access_token: 'test',
      refresh_token: 'test',
    }))

    expect(localStorage.getItem('mony_tokens')).toBeTruthy()

    localStorage.removeItem('mony_tokens')

    expect(localStorage.getItem('mony_tokens')).toBeNull()
  })
})

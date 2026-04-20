/**
 * TwoFASetup component for TOTP 2FA configuration.
 *
 * Shows QR code, secret, and backup codes.
 * User scans QR with Google Authenticator/Authy.
 */

'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useAuth } from '@/stores/auth/useAuth'

export interface TwoFASetupProps {
  onSuccess?: () => void
  onCancel?: () => void
}

export const TwoFASetup = ({ onSuccess, onCancel }: TwoFASetupProps) => {
  const { setup2FA, loading, error } = useAuth()
  const [step, setStep] = useState<'request' | 'confirm'>('request')
  const [qrCode, setQrCode] = useState<string>('')
  const [secret, setSecret] = useState<string>('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [totp, setTotp] = useState('')
  const [validationError, setValidationError] = useState('')

  const handleRequestSetup = async () => {
    try {
      const data = await setup2FA()
      setQrCode(data.qr_code)
      setSecret(data.secret)
      setBackupCodes(data.backup_codes)
      setStep('confirm')
    } catch (err) {
      // Error is handled by useAuth hook
    }
  }

  const handleConfirm = async () => {
    if (!totp || totp.length !== 6 || !/^\d+$/.test(totp)) {
      setValidationError('Invalid code format (6 digits required)')
      return
    }

    // TODO: Send verify_2fa request to backend
    // For now, just show success
    onSuccess?.()
  }

  if (step === 'request') {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Enable Two-Factor Authentication</h3>
          <p className="mt-2 text-sm text-gray-600">
            Add an extra layer of security to your account by enabling 2FA.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={handleRequestSetup}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
        >
          {loading ? 'Setting up...' : 'Get started'}
        </button>

        <button
          onClick={onCancel}
          disabled={loading}
          className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Scan QR Code</h3>
        <p className="mt-2 text-sm text-gray-600">
          Use Google Authenticator, Authy, or another TOTP app to scan this QR code.
        </p>
      </div>

      {/* QR Code */}
      {qrCode && (
        <div className="flex justify-center">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <img src={qrCode} alt="2FA QR Code" className="w-64 h-64" />
          </div>
        </div>
      )}

      {/* Secret (fallback) */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Can't scan? Enter this code manually:
        </label>
        <div className="mt-2 p-3 bg-gray-100 rounded-lg font-mono text-center text-gray-800 break-all">
          {secret}
        </div>
      </div>

      {/* TOTP input */}
      <div>
        <label htmlFor="totp" className="block text-sm font-medium text-gray-700">
          Enter 6-digit code from your app
        </label>
        <input
          type="text"
          id="totp"
          value={totp}
          onChange={(e) => {
            setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))
            setValidationError('')
          }}
          maxLength={6}
          placeholder="000000"
          className={`mt-2 w-full px-4 py-2 border rounded-lg text-center text-2xl font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            validationError ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {validationError && (
          <p className="mt-1 text-sm text-red-500">{validationError}</p>
        )}
      </div>

      {/* Backup codes */}
      {backupCodes.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="font-semibold text-amber-900 mb-3">Save these backup codes</p>
          <p className="text-sm text-amber-800 mb-3">
            If you lose access to your authenticator app, you can use these codes to regain access.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {backupCodes.map((code, idx) => (
              <code key={idx} className="bg-white p-2 rounded text-center font-mono text-sm text-gray-800">
                {code}
              </code>
            ))}
          </div>
          <button
            onClick={() => {
              const text = backupCodes.join('\n')
              navigator.clipboard.writeText(text)
            }}
            className="text-sm text-amber-600 hover:underline"
          >
            Copy codes
          </button>
        </div>
      )}

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        disabled={totp.length !== 6 || loading}
        className="w-full bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 transition-colors"
      >
        {loading ? 'Enabling...' : 'Enable 2FA'}
      </button>

      <button
        onClick={onCancel}
        disabled={loading}
        className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50 transition-colors"
      >
        Cancel
      </button>
    </div>
  )
}

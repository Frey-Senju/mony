'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  UserCircle,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Save,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { TwoFASetup } from '@/components/auth/TwoFASetup'
import { useAuth } from '@/stores/auth/useAuth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface UserProfile {
  id: string
  email: string
  full_name: string
  phone?: string | null
  preferred_currency: string
  timezone: string
  is_email_verified: boolean
  two_factor_enabled: boolean
  plan: string
  created_at: string
}

export default function ProfileSettingsPage() {
  return (
    <PrivateRoute>
      <ProfileContent />
    </PrivateRoute>
  )
}

function ProfileContent() {
  const { tokens } = useAuth()
  const token = tokens?.access_token

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  // Profile form state
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [currency, setCurrency] = useState('BRL')
  const [timezone, setTimezone] = useState('America/Sao_Paulo')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [profileErr, setProfileErr] = useState<string | null>(null)

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<string | null>(null)
  const [pwErr, setPwErr] = useState<string | null>(null)

  // 2FA state
  const [show2FASetup, setShow2FASetup] = useState(false)
  const [disableCode, setDisableCode] = useState('')
  const [disabling2FA, setDisabling2FA] = useState(false)
  const [twoFaMsg, setTwoFaMsg] = useState<string | null>(null)
  const [twoFaErr, setTwoFaErr] = useState<string | null>(null)

  const loadProfile = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/auth/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = (await res.json()) as UserProfile
        setProfile(data)
        setFullName(data.full_name || '')
        setPhone(data.phone || '')
        setCurrency(data.preferred_currency || 'BRL')
        setTimezone(data.timezone || 'America/Sao_Paulo')
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setSavingProfile(true)
    setProfileMsg(null)
    setProfileErr(null)
    try {
      const res = await fetch(`${API_URL}/auth/users/me`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
          preferred_currency: currency,
          timezone,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao salvar perfil')
      }
      const updated = (await res.json()) as UserProfile
      setProfile(updated)
      setProfileMsg('Dados do perfil atualizados com sucesso!')
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Erro ao salvar perfil')
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setPwMsg(null)
    setPwErr(null)
    if (newPassword.length < 8) {
      setPwErr('A nova senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwErr('A confirmação da nova senha não coincide.')
      return
    }
    setSavingPw(true)
    try {
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Erro ao alterar senha')
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPwMsg('Senha alterada com sucesso!')
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Erro ao alterar senha')
    } finally {
      setSavingPw(false)
    }
  }

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || disableCode.length !== 6) return
    setDisabling2FA(true)
    setTwoFaErr(null)
    setTwoFaMsg(null)
    try {
      const res = await fetch(`${API_URL}/auth/2fa/disable`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ totp_code: disableCode }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Código 2FA inválido')
      }
      setDisableCode('')
      setTwoFaMsg('Autenticação em dois fatores desativada.')
      await loadProfile()
    } catch (err) {
      setTwoFaErr(err instanceof Error ? err.message : 'Falha ao desativar 2FA')
    } finally {
      setDisabling2FA(false)
    }
  }

  const initials = (profile?.full_name || 'M')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <header className="glass-panel flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold shadow-md shrink-0"
          style={{ background: 'var(--accent)' }}
          aria-hidden="true"
        >
          {initials}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight truncate">
              Perfil & Segurança
            </h1>
            {profile?.plan && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/60 dark:bg-white/10 text-slate-800 dark:text-slate-100 border border-white/70 dark:border-white/15">
                Plano {profile.plan}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 truncate">
            {profile?.email || 'Carregando dados da conta...'}
          </p>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <div className="glass-card h-56 animate-pulse" />
          <div className="glass-card h-48 animate-pulse" />
        </div>
      ) : (
        <>
          {/* Card 1: Personal Profile */}
          <form onSubmit={handleProfileSave} className="glass-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <UserCircle className="w-5 h-5" style={{ color: 'var(--accent)' }} aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Dados Pessoais & Preferências
              </h2>
            </div>

            {profileMsg && (
              <div role="status" className="p-3 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {profileMsg}
              </div>
            )}
            {profileErr && (
              <div role="alert" className="p-3 rounded-xl bg-rose-50/90 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {profileErr}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="profile-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nome completo
                </label>
                <input
                  id="profile-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input-base"
                />
              </div>

              <div>
                <label htmlFor="profile-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  E-mail
                </label>
                <input
                  id="profile-email"
                  type="email"
                  disabled
                  value={profile?.email || ''}
                  className="input-base opacity-65 cursor-not-allowed"
                />
              </div>

              <div>
                <label htmlFor="profile-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Telefone / WhatsApp
                </label>
                <input
                  id="profile-phone"
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="profile-currency" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Moeda
                  </label>
                  <select
                    id="profile-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="input-base"
                  >
                    <option value="BRL">BRL (R$)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="profile-tz" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Fuso horário
                  </label>
                  <select
                    id="profile-tz"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="input-base"
                  >
                    <option value="America/Sao_Paulo">Brasília (BRT)</option>
                    <option value="America/Manaus">Manaus (AMT)</option>
                    <option value="America/New_York">New York (EST)</option>
                    <option value="Europe/Lisbon">Lisboa (WET)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={savingProfile}
                className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                <Save className="w-4 h-4" aria-hidden="true" />
                {savingProfile ? 'Salvando...' : 'Salvar Perfil'}
              </button>
            </div>
          </form>

          {/* Card 2: Change Password */}
          <form onSubmit={handlePasswordChange} className="glass-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" style={{ color: 'var(--accent)' }} aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Alterar Senha
              </h2>
            </div>

            {pwMsg && (
              <div role="status" className="p-3 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {pwMsg}
              </div>
            )}
            {pwErr && (
              <div role="alert" className="p-3 rounded-xl bg-rose-50/90 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {pwErr}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="pw-current" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Senha atual
                </label>
                <input
                  id="pw-current"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input-base"
                />
              </div>
              <div>
                <label htmlFor="pw-new" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nova senha (mín. 8)
                </label>
                <input
                  id="pw-new"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-base"
                />
              </div>
              <div>
                <label htmlFor="pw-confirm" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Confirmar nova senha
                </label>
                <input
                  id="pw-confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-base"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingPw}
                className="liquid-btn liquid-btn-glass px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {savingPw ? 'Atualizando...' : 'Atualizar Senha'}
              </button>
            </div>
          </form>

          {/* Card 3: 2FA (TOTP) Security */}
          <div className="glass-card p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {profile?.two_factor_enabled ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" aria-hidden="true" />
                )}
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Autenticação em Dois Fatores (2FA / TOTP)
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Proteja sua conta financeira com Google Authenticator, 1Password ou Authy.
                  </p>
                </div>
              </div>
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full self-start sm:self-auto ${
                  profile?.two_factor_enabled
                    ? 'bg-emerald-100/90 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100/90 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                }`}
              >
                {profile?.two_factor_enabled ? 'Ativo' : 'Desativado'}
              </span>
            </div>

            {twoFaMsg && (
              <div role="status" className="p-3 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                {twoFaMsg}
              </div>
            )}
            {twoFaErr && (
              <div role="alert" className="p-3 rounded-xl bg-rose-50/90 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-medium">
                {twoFaErr}
              </div>
            )}

            {profile?.two_factor_enabled ? (
              <form onSubmit={handleDisable2FA} className="pt-2 border-t border-white/40 dark:border-white/10 flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <label htmlFor="disable-totp" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Para desativar o 2FA, digite o código de 6 dígitos do seu aplicativo autenticador
                  </label>
                  <input
                    id="disable-totp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="input-base font-mono tracking-widest max-w-[200px]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={disableCode.length !== 6 || disabling2FA}
                  className="liquid-btn liquid-btn-glass px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 disabled:opacity-50"
                >
                  {disabling2FA ? 'Desativando...' : 'Desativar 2FA'}
                </button>
              </form>
            ) : show2FASetup ? (
              <div className="pt-2 border-t border-white/40 dark:border-white/10 bg-white/75 dark:bg-slate-900/60 p-5 rounded-2xl">
                <TwoFASetup
                  onSuccess={async () => {
                    setShow2FASetup(false)
                    setTwoFaMsg('Autenticação em dois fatores ativada com sucesso!')
                    await loadProfile()
                  }}
                  onCancel={() => setShow2FASetup(false)}
                />
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setTwoFaMsg(null)
                    setTwoFaErr(null)
                    setShow2FASetup(true)
                  }}
                  className="liquid-btn liquid-btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                >
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  Configurar 2FA com QR Code
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

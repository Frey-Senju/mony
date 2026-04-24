'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { PrivateRoute } from '@/components/auth/PrivateRoute'
import { InstitutionCard } from '@/components/open-finance/institution-card'
import { LinkedAccountCard } from '@/components/open-finance/linked-account-card'
import { DisconnectModal } from '@/components/open-finance/disconnect-modal'
import { ConsentLoading } from '@/components/open-finance/consent-loading'
import {
  listInstitutions,
  listLinkedAccounts,
  initiateConsent,
  unlinkAccount,
  type Institution,
  type LinkedAccount,
} from '@/lib/api/open-finance'
import { useAuth } from '@/stores/auth/useAuth'

export default function ConnectionsPage() {
  return (
    <PrivateRoute>
      <ConnectionsContent />
    </PrivateRoute>
  )
}

function ConnectionsContent() {
  const { tokens } = useAuth()
  const searchParams = useSearchParams()

  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([])
  const [search, setSearch] = useState('')
  const [loadingInstitutions, setLoadingInstitutions] = useState(true)
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [disconnectTarget, setDisconnectTarget] = useState<LinkedAccount | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null)

  const accessToken = tokens?.access_token || ''

  const showNotification = useCallback((type: 'success' | 'error' | 'warning', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }, [])

  // Handle callback query params (success/error from OAuth flow)
  useEffect(() => {
    const successParam = searchParams.get('success')
    const errorParam = searchParams.get('error')
    const warningParam = searchParams.get('warning')

    if (successParam === 'true') {
      showNotification('success', 'Conta vinculada com sucesso!')
    } else if (errorParam) {
      const messages: Record<string, string> = {
        consent_expired: 'O prazo de autorização expirou. Tente novamente.',
        invalid_state: 'Sessão inválida. Tente novamente.',
        token_exchange_failed: 'Falha ao autenticar com o banco. Tente novamente.',
        no_code: 'Autorização cancelada.',
      }
      showNotification('error', messages[errorParam] || `Erro: ${errorParam}`)
    } else if (warningParam === 'accounts_fetch_failed') {
      showNotification('warning', 'Conta autorizada, mas não foi possível buscar os dados. Tente sincronizar mais tarde.')
    }
  }, [searchParams, showNotification])

  // Fetch institutions
  useEffect(() => {
    if (!accessToken) return
    setLoadingInstitutions(true)
    listInstitutions(accessToken, search || undefined)
      .then(setInstitutions)
      .catch(() => showNotification('error', 'Erro ao buscar instituições'))
      .finally(() => setLoadingInstitutions(false))
  }, [accessToken, search, showNotification])

  // Fetch linked accounts
  const fetchLinkedAccounts = useCallback(() => {
    if (!accessToken) return
    setLoadingAccounts(true)
    listLinkedAccounts(accessToken)
      .then(setLinkedAccounts)
      .catch(() => showNotification('error', 'Erro ao buscar contas vinculadas'))
      .finally(() => setLoadingAccounts(false))
  }, [accessToken, showNotification])

  useEffect(() => {
    fetchLinkedAccounts()
  }, [fetchLinkedAccounts])

  const handleConnect = async (institution: Institution) => {
    if (!accessToken) return
    setConnectingId(institution.id)
    try {
      const consent = await initiateConsent(accessToken, institution.id)
      window.location.href = consent.authorization_url
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao iniciar conexão'
      showNotification('error', message)
      setConnectingId(null)
    }
  }

  const handleDisconnectConfirm = async () => {
    if (!disconnectTarget || !accessToken) return
    setDisconnecting(true)
    try {
      await unlinkAccount(accessToken, disconnectTarget.id)
      showNotification('success', 'Conta desvinculada com sucesso.')
      fetchLinkedAccounts()
    } catch {
      showNotification('error', 'Erro ao desvincular conta.')
    } finally {
      setDisconnecting(false)
      setDisconnectTarget(null)
    }
  }

  const notificationColors = {
    success: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300',
    error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300',
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Conexões Bancárias
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Conecte suas contas bancárias via Open Finance (sandbox).
          </p>
        </div>

        {/* Notification */}
        {notification && (
          <div className={`border rounded-lg px-4 py-3 text-sm font-medium ${notificationColors[notification.type]}`}>
            {notification.message}
          </div>
        )}

        {/* Linked Accounts */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Contas Vinculadas
          </h2>
          {loadingAccounts ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Carregando...</div>
          ) : linkedAccounts.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-center">
              Nenhuma conta vinculada ainda.
            </div>
          ) : (
            linkedAccounts.map((acct) => (
              <LinkedAccountCard
                key={acct.id}
                account={acct}
                onDisconnect={setDisconnectTarget}
              />
            ))
          )}
        </section>

        {/* Connect New Account */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Conectar Nova Conta
          </h2>
          <input
            type="text"
            placeholder="Buscar instituição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {connectingId && <ConsentLoading institutionName={institutions.find(i => i.id === connectingId)?.name} />}
          {loadingInstitutions ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Carregando instituições...</div>
          ) : (
            <div className="space-y-2">
              {institutions.map((inst) => (
                <InstitutionCard
                  key={inst.id}
                  institution={inst}
                  onConnect={handleConnect}
                  loading={connectingId === inst.id}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Disconnect Modal */}
      <DisconnectModal
        account={disconnectTarget}
        onConfirm={handleDisconnectConfirm}
        onCancel={() => setDisconnectTarget(null)}
        loading={disconnecting}
      />
    </div>
  )
}

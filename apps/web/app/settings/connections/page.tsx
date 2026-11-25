'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ShieldCheck,
  Building2,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  TrendingUp,
  Layers,
  Link2,
  KeyRound,
} from 'lucide-react'
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
  triggerSync,
  getPluggyStatus,
  createPluggyConnectToken,
  linkPluggyItem,
  syncPluggyAccount,
  type Institution,
  type LinkedAccount,
  type PluggyStatusResponse,
  type PluggyLinkItemResponse,
} from '@/lib/api/open-finance'
import { useAuth } from '@/stores/auth/useAuth'

const PluggyConnect = dynamic(
  () => import('react-pluggy-connect').then((mod) => mod.PluggyConnect),
  { ssr: false }
)

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
  const [pluggyStatus, setPluggyStatus] = useState<PluggyStatusResponse | null>(null)
  const [lastDedupReport, setLastDedupReport] = useState<PluggyLinkItemResponse | null>(null)
  const [connectToken, setConnectToken] = useState<string | null>(null)
  const [includeSandbox, setIncludeSandbox] = useState(false)
  const [manualItemId, setManualItemId] = useState('')
  const [showManualItemImport, setShowManualItemImport] = useState(false)
  const [search, setSearch] = useState('')
  const [loadingInstitutions, setLoadingInstitutions] = useState(true)
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [pluggyLoading, setPluggyLoading] = useState(false)
  const [disconnectTarget, setDisconnectTarget] = useState<LinkedAccount | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null)
  const [showLegacyBanks, setShowLegacyBanks] = useState(false)
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'warning'
    message: string
  } | null>(null)

  const accessToken = tokens?.access_token || ''

  const showNotification = useCallback((type: 'success' | 'error' | 'warning', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 8000)
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
      showNotification(
        'warning',
        'Conta autorizada, mas não foi possível buscar os dados. Tente sincronizar mais tarde.'
      )
    }
  }, [searchParams, showNotification])

  const fetchPluggyStatus = useCallback(() => {
    if (!accessToken) return
    getPluggyStatus(accessToken)
      .then(setPluggyStatus)
      .catch(() => setPluggyStatus(null))
  }, [accessToken])

  useEffect(() => {
    fetchPluggyStatus()
  }, [fetchPluggyStatus])

  useEffect(() => {
    if (!accessToken) return
    setLoadingInstitutions(true)
    listInstitutions(accessToken, search || undefined)
      .then(setInstitutions)
      .catch(() => showNotification('error', 'Erro ao buscar instituições'))
      .finally(() => setLoadingInstitutions(false))
  }, [accessToken, search, showNotification])

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

  const finalizePluggyLink = async (itemId: string, institutionName?: string) => {
    const report = await linkPluggyItem(accessToken, itemId, institutionName, 90)
    setLastDedupReport(report)
    showNotification(
      'success',
      `${report.institution_name}: ${report.accounts_linked} nova(s) · ${report.accounts_reused} reutilizada(s) · ${report.transactions_inserted} lançamento(s) · ${report.transactions_skipped_dedup} duplicata(s) evitada(s) · ${report.transactions_reconciled} conciliado(s).`
    )
    fetchLinkedAccounts()
    fetchPluggyStatus()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('mony:transactions-updated'))
    }
  }

  const handlePluggyConnect = async () => {
    if (!accessToken) return
    setPluggyLoading(true)
    try {
      const tokenRes = await createPluggyConnectToken(accessToken)
      if (tokenRes.mode === 'live') {
        setConnectToken(tokenRes.access_token)
      } else {
        // Hybrid sandbox mode fallback when credentials are not configured
        await finalizePluggyLink(`sandbox-nubank-item-${Date.now()}`, 'Nubank (Open Finance)')
        setPluggyLoading(false)
      }
    } catch (err) {
      showNotification(
        'error',
        err instanceof Error ? err.message : 'Erro ao conectar via Pluggy Open Finance'
      )
      setPluggyLoading(false)
    }
  }

  const handleManualItemImport = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = manualItemId.trim()
    if (!trimmed || !accessToken) return
    setPluggyLoading(true)
    try {
      await finalizePluggyLink(trimmed)
      setManualItemId('')
      setShowManualItemImport(false)
    } catch (err) {
      showNotification(
        'error',
        err instanceof Error ? err.message : 'Erro ao importar Item ID do Pluggy'
      )
    } finally {
      setPluggyLoading(false)
    }
  }

  const handleSimulateReconnect = async () => {
    if (!accessToken) return
    setPluggyLoading(true)
    try {
      await finalizePluggyLink(
        `sandbox-nubank-reconnect-${Date.now()}`,
        'Nubank (Open Finance)'
      )
    } catch (err) {
      showNotification(
        'error',
        err instanceof Error ? err.message : 'Erro ao testar reconexão anti-duplicata'
      )
    } finally {
      setPluggyLoading(false)
    }
  }

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

  const handleSync = async (account: LinkedAccount) => {
    if (!accessToken) return
    setSyncingAccountId(account.id)
    try {
      if (account.provider === 'pluggy') {
        const res = await syncPluggyAccount(accessToken, account.id)
        showNotification(
          'success',
          `Sincronizado (3 camadas): ${res.transactions_inserted} nova(s) · ${res.transactions_skipped_dedup} duplicata(s) evitada(s) · ${res.transactions_reconciled} conciliada(s).`
        )
        fetchLinkedAccounts()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('mony:transactions-updated'))
        }
      } else {
        const result = await triggerSync(accessToken, account.id)
        showNotification(
          'success',
          `Sync iniciado (${result.accounts_queued} conta${result.accounts_queued > 1 ? 's' : ''}).`
        )
        setTimeout(fetchLinkedAccounts, 1500)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao iniciar sync'
      showNotification('error', message)
    } finally {
      setSyncingAccountId(null)
    }
  }

  const handleDisconnectConfirm = async () => {
    if (!disconnectTarget || !accessToken) return
    setDisconnecting(true)
    try {
      await unlinkAccount(accessToken, disconnectTarget.id)
      showNotification(
        'success',
        'Conta desvinculada. Se reconectar depois, suas contas e lançamentos não serão duplicados.'
      )
      fetchLinkedAccounts()
      fetchPluggyStatus()
    } catch {
      showNotification('error', 'Erro ao desvincular conta.')
    } finally {
      setDisconnecting(false)
      setDisconnectTarget(null)
    }
  }

  const notificationColors = {
    success:
      'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
    error: 'bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300',
    warning: 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300',
  }

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6">
      {/* Official Pluggy Connect Modal */}
      {connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={includeSandbox}
          onSuccess={async (itemData) => {
            setConnectToken(null)
            try {
              const itemId = itemData?.item?.id
              const connectorName = itemData?.item?.connector?.name
              if (itemId) {
                await finalizePluggyLink(itemId, connectorName)
              }
            } catch (err) {
              showNotification(
                'error',
                err instanceof Error ? err.message : 'Erro ao importar item do Pluggy'
              )
            } finally {
              setPluggyLoading(false)
            }
          }}
          onError={(err) => {
            setConnectToken(null)
            setPluggyLoading(false)
            showNotification('error', err?.message || 'Erro no widget Pluggy Connect')
          }}
          onClose={() => {
            setConnectToken(null)
            setPluggyLoading(false)
          }}
        />
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="glass-btn p-2.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              aria-label="Voltar ao Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
                <Building2 className="w-6 h-6 text-[var(--accent)]" />
                Open Finance &amp; Conexões Bancárias
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                Importação automática de contas, cartões e investimentos com motor anti-duplicata em 3 camadas.
              </p>
            </div>
          </div>

          <Link
            href="/dashboard/investments"
            className="glass-btn px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 text-[var(--text-primary)]"
          >
            <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
            Ir para Investimentos B3
          </Link>
        </div>

        {/* Notification */}
        {notification && (
          <div
            className={`glass-card border rounded-2xl px-4 py-3 text-sm font-medium flex items-center gap-2.5 ${notificationColors[notification.type]}`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notification.message}</span>
          </div>
        )}

        {/* Pluggy Open Finance Real Hero Panel */}
        <section className="glass-panel rounded-3xl p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Sparkles className="w-3.5 h-3.5" />
                  Pluggy Open Finance Brasil
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    pluggyStatus?.mode === 'live'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {pluggyStatus?.mode === 'live'
                    ? 'Modo Live Ativo (Bancos Reais)'
                    : 'Modo Híbrido Sandbox (Pronto para chaves Live)'}
                </span>
              </div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Conecte bancos, cartões e corretoras sem medo de duplicar dados
              </h2>
              <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
                Mesmo se o consentimento expirar ou você desconectar e reconectar o mesmo banco meses depois, o Mony reutiliza a mesma conta via{' '}
                <code className="text-xs px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">account_fingerprint</code>{' '}
                e bloqueia qualquer lançamento repetido.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handlePluggyConnect}
                  disabled={pluggyLoading}
                  className="liquid-btn px-4 py-2.5 rounded-2xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  <Link2 className="w-4 h-4" />
                  {pluggyLoading
                    ? 'Abrindo Pluggy...'
                    : pluggyStatus?.mode === 'live'
                      ? 'Conectar Banco Real (Pluggy)'
                      : 'Conectar Banco (Pluggy Sandbox)'}
                </button>

                <button
                  onClick={() => setShowManualItemImport((v) => !v)}
                  className="glass-btn px-3 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-1.5 text-[var(--text-primary)]"
                  title="Importar uma conta já conectada no Meu Pluggy ou Dashboard Pluggy pelo Item ID"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Importar Item ID
                </button>

                {pluggyStatus?.mode !== 'live' && (
                  <button
                    onClick={handleSimulateReconnect}
                    disabled={pluggyLoading}
                    className="glass-btn px-3.5 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-1.5 text-[var(--text-primary)] disabled:opacity-50"
                    title="Simula desconectar e reconectar o mesmo banco com novo item_id para comprovar 0 duplicatas"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${pluggyLoading ? 'animate-spin' : ''}`} />
                    Testar Reconexão
                  </button>
                )}
              </div>

              {pluggyStatus?.mode === 'live' && (
                <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeSandbox}
                    onChange={(e) => setIncludeSandbox(e.target.checked)}
                    className="rounded accent-[var(--accent)]"
                  />
                  Incluir banco de teste (Pluggy Sandbox) no widget
                </label>
              )}
            </div>
          </div>

          {/* Optional Direct Item ID Importer (Meu Pluggy) */}
          {showManualItemImport && (
            <form
              onSubmit={handleManualItemImport}
              className="glass-card rounded-2xl p-4 flex flex-wrap items-center gap-3 border border-[var(--accent)]/30"
            >
              <div className="flex-1 min-w-[240px]">
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Item ID já conectado na Pluggy / Meu Pluggy
                </label>
                <input
                  type="text"
                  value={manualItemId}
                  onChange={(e) => setManualItemId(e.target.value)}
                  placeholder="Ex.: 9f8a7b6c-1234-4567-890a-bcdef1234567"
                  className="w-full px-3 py-2 glass-input rounded-xl text-xs font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={pluggyLoading || !manualItemId.trim()}
                className="liquid-btn px-4 py-2 rounded-xl text-xs font-semibold mt-4 sm:mt-5 disabled:opacity-50"
              >
                {pluggyLoading ? 'Importando...' : 'Sincronizar Item'}
              </button>
            </form>
          )}

          {/* 3-Layer Deduplication Shield Pills */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="glass-card rounded-2xl p-3.5 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  Camada 1 · ID Externo
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Bloqueia instantaneamente o mesmo <code className="text-[10px]">external_id</code> em syncs e webhooks repetidos.
                </p>
              </div>
            </div>
            <div className="glass-card rounded-2xl p-3.5 flex items-start gap-2.5">
              <Layers className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  Camada 2 · Hash Determinístico
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  SHA-256 por conta + data + valor + descrição normalizada protege reconexões com novo <code className="text-[10px]">item_id</code>.
                </p>
              </div>
            </div>
            <div className="glass-card rounded-2xl p-3.5 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  Camada 3 · Conciliação IA/Manual
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Detecta gastos lançados na Mony IA ou manualmente (±2 dias, mesmo valor) e concilia sem duplicar.
                </p>
              </div>
            </div>
          </div>

          {/* Latest Dedup Sync Report */}
          {lastDedupReport && (
            <div className="glass-card rounded-2xl p-4 border border-emerald-500/30 bg-emerald-500/5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Relatório da Última Sincronização · {lastDedupReport.institution_name}
                </span>
                <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                  item: {lastDedupReport.item_id}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                <div className="rounded-xl bg-black/5 dark:bg-white/5 p-2">
                  <div className="text-lg font-bold text-[var(--text-primary)]">
                    {lastDedupReport.accounts_linked}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">Contas novas</div>
                </div>
                <div className="rounded-xl bg-black/5 dark:bg-white/5 p-2">
                  <div className="text-lg font-bold text-[var(--accent)]">
                    {lastDedupReport.accounts_reused}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">Reutilizadas</div>
                </div>
                <div className="rounded-xl bg-black/5 dark:bg-white/5 p-2">
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {lastDedupReport.transactions_inserted}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">Lançamentos novos</div>
                </div>
                <div className="rounded-xl bg-black/5 dark:bg-white/5 p-2">
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {lastDedupReport.transactions_skipped_dedup}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">Duplicatas evitadas</div>
                </div>
                <div className="rounded-xl bg-black/5 dark:bg-white/5 p-2">
                  <div className="text-lg font-bold text-sky-600 dark:text-sky-400">
                    {lastDedupReport.transactions_reconciled}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">Conciliadas</div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Linked Accounts */}
        <section className="glass-panel rounded-3xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Contas Vinculadas ({linkedAccounts.length})
            </h2>
            <button
              onClick={fetchLinkedAccounts}
              className="glass-btn px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Atualizar
            </button>
          </div>

          {loadingAccounts ? (
            <div className="text-sm text-[var(--text-secondary)] py-4">Carregando...</div>
          ) : linkedAccounts.length === 0 ? (
            <div className="text-sm text-[var(--text-secondary)] p-6 border border-dashed border-[var(--glass-border)] rounded-2xl text-center">
              Nenhuma conta vinculada ainda. Clique em{' '}
              <strong className="text-[var(--text-primary)]">Conectar Banco</strong> acima para começar.
            </div>
          ) : (
            <div className="space-y-2.5">
              {linkedAccounts.map((acct) => (
                <div key={acct.id} className="relative">
                  {acct.provider === 'pluggy' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-t-lg bg-[var(--accent-soft)] text-[var(--accent)] ml-3">
                      <ShieldCheck className="w-3 h-3" />
                      Pluggy · Anti-Duplicata 3 Camadas
                    </span>
                  )}
                  <LinkedAccountCard
                    account={acct}
                    onDisconnect={setDisconnectTarget}
                    onSync={handleSync}
                    syncing={syncingAccountId === acct.id}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Legacy / Direct Sandbox Institutions (collapsible) */}
        <section className="glass-panel rounded-3xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Conectar Nova Conta (Diretório Open Finance Direto)
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Fluxo OAuth2 legado / sandbox direto por instituição.
              </p>
            </div>
            <button
              onClick={() => setShowLegacyBanks((v) => !v)}
              className="glass-btn px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--text-primary)]"
            >
              {showLegacyBanks ? 'Ocultar lista' : 'Mostrar instituições'}
            </button>
          </div>

          {showLegacyBanks && (
            <div className="space-y-3 pt-2">
              <input
                type="text"
                placeholder="Buscar instituição..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2.5 glass-input rounded-xl text-sm"
              />
              {connectingId && (
                <ConsentLoading
                  institutionName={institutions.find((i) => i.id === connectingId)?.name}
                />
              )}
              {loadingInstitutions ? (
                <div className="text-sm text-[var(--text-secondary)]">
                  Carregando instituições...
                </div>
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

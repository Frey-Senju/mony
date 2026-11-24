# Próximos Passos — Mony

**Última atualização:** 2026-11-24  
**Status:** ✅ 100% Online em Produção (Vercel Frontend + Vercel FastAPI + Supabase PostgreSQL)

---

## Arquitetura em Produção (Render substituído!)

| Camada | Serviço | URL / Detalhe |
|---|---|---|
| **Frontend (Next.js 14 + Liquid Glass)** | Vercel (`mony`) | https://mony-kappa.vercel.app |
| **Backend API (FastAPI Serverless)** | Vercel (`mony-api`) | https://mony-api-one.vercel.app |
| **Banco de Dados (PostgreSQL 17)** | Supabase (`licitacoes-intel-preview`) | Schema isolado `mony`, role dedicada `mony_app` + RLS habilitado em 16 tabelas |
| **CI/CD** | GitHub Actions | `Frey-Senju/mony` (lint, pytest Postgres 15, Jest, Playwright E2E, build) |

*(Os serviços antigos no Render — `mony-api`, `mony` e `mony-redis` — podem ser removidos quando desejar.)*

---

## Roadmap — Próximos Passos Recomendados (EPIC-004)

### 1. Lançamento & Operação Real (Curto Prazo)
- [ ] **Domínio personalizado:** configurar domínio próprio (ex.: `app.mony.com.br` e `api.mony.com.br`) na Vercel e atualizar `CORS_ORIGINS`.
- [ ] **E-mail transacional (Resend):** adicionar `RESEND_API_KEY` nas env vars do `mony-api` na Vercel para ativar o envio real de e-mails de redefinição de senha e verificação de e-mail.
- [ ] **Upstash Redis (opcional):** se quiser blacklist de logout distribuída entre instâncias serverless (hoje usa fallback em memória) ou rate limiting distribuído, plugar Upstash Redis via `REDIS_URL`.

### 2. Monetização & Planos (Médio Prazo)
- [ ] **Checkout Stripe / Mercado Pago:** o gating de planos (`BASIC` / `PRO` / `PREMIUM`) já está ativo no backend (Transactions, Budgets e Open Finance), faltando a página `/settings/billing` + webhook de assinatura.
- [ ] **Gestão de Perfil e Segurança (`/settings/profile`):** conectar UI ao novo `GET/PUT /auth/users/me` e ao fluxo completo de 2FA (`/auth/2fa/setup`, `/auth/2fa/verify`, `/auth/2fa/disable`).

### 3. Evolução de Produto (EPIC-004 / EPIC-005)
- [ ] **Open Finance Real (Pluggy ou Belvo):** substituir o modo sandbox/stub (`OF_SYNC_USE_STUB=1`) por agregador regulado pelo Bacen sem precisar manter certificado ICP-Brasil próprio.
- [ ] **Transações Recorrentes Automáticas:** usar Vercel Cron (`/api/cron/recurring`) para materializar lançamentos recorrentes (`is_recurring`, `recurring_pattern`).
- [ ] **Transferências entre contas:** atualizar saldo de conta origem e conta destino atomicamente.
- [ ] **OCR de Recibos & Entrada em Linguagem Natural (IA):** extrair valor/data/estabelecimento de foto ou texto livre ("Almoço iFood 48 reais").

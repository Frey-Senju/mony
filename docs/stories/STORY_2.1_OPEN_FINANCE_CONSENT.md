# Story 2.1 — Open Finance: Consent Flow & Account Linking

**Epic:** 2 — Open Finance & Intelligence  
**Story ID:** 2.1  
**Status:** Ready  
**Estimated:** 10-12 hours  
**Priority:** P0  
**Depends on:** EPIC-001 ✅ (Auth, Transactions, Deploy)

---

## Overview

Implementar o fluxo de consentimento Open Finance Brasil (Bacen) para que o usuário possa vincular sua conta bancária ao Mony. O fluxo segue o padrão OAuth2 do Open Banking Brasil, permitindo que o app solicite permissão de leitura de dados financeiros (saldo, transações) em nome do usuário.

**Escopo MVP:**
- Sandbox Bacen apenas (produção exige certificado digital)
- Instituições: Banco do Brasil, Bradesco, Itaú, Nubank (sandbox disponível)
- Permissões: `openid`, `accounts`, `transactions` (leitura somente)
- 1 conta vinculada por usuário no plano BASIC

---

## Acceptance Criteria

### AC-1: Listagem de Instituições
- [ ] GET `/open-finance/institutions` retorna lista de instituições disponíveis no sandbox
- [ ] Cada instituição inclui: `id`, `name`, `logo_url`, `authorization_server_url`
- [ ] Frontend exibe cards das instituições com logo e nome
- [ ] Filtro de busca por nome de instituição

### AC-2: Início do Consent Flow
- [ ] POST `/open-finance/consent/initiate` cria um consent request
  - [ ] Body: `{ institution_id: string, permissions: string[] }`
  - [ ] Retorna `{ consent_id, authorization_url, expires_at }`
  - [ ] `expires_at` = 30 minutos (TTL do consent)
  - [ ] Consent salvo no banco com status `PENDING`
- [ ] Frontend redireciona usuário para `authorization_url` do banco
- [ ] State param incluído para CSRF protection

### AC-3: Callback OAuth2
- [ ] GET `/open-finance/consent/callback` processa retorno do banco
  - [ ] Query params: `code`, `state`, `error?`
  - [ ] Troca `code` por access token via POST ao `token_endpoint` do banco
  - [ ] Valida `state` contra o consent salvo (anti-CSRF)
  - [ ] Em sucesso: atualiza consent status para `AUTHORIZED`
  - [ ] Em erro: atualiza para `REJECTED`, retorna mensagem clara

### AC-4: Account Linking
- [ ] Após consent autorizado, busca contas do usuário via `GET /accounts` da API do banco
- [ ] Salva linked account com: `institution_id`, `account_id`, `account_type`, `account_number_last4`, `owner_name`
- [ ] Limite: 1 conta para plano BASIC, 5 para PRO, ilimitado para PREMIUM
- [ ] GET `/open-finance/accounts` lista contas vinculadas do usuário autenticado

### AC-5: Desvinculação
- [ ] DELETE `/open-finance/accounts/{linked_account_id}` remove vinculação
  - [ ] Revoga consent no banco via `DELETE /consents/{consent_id}` (best effort)
  - [ ] Remove linked account do banco de dados
  - [ ] Não remove transações históricas já importadas
- [ ] Frontend exibe botão de desvinculação com confirmação modal

### AC-6: Error Handling
- [ ] Consent expirado (>30 min): retorna 410 Gone com mensagem amigável
- [ ] Banco retorna erro OAuth: exibe mensagem do banco para o usuário
- [ ] Rate limit: máximo 3 consent attempts por hora por usuário
- [ ] Timeout de 10s em chamadas ao banco externo (httpx)

### AC-7: UI
- [ ] Página `/settings/connections` exibe contas vinculadas
- [ ] Status visual: `connected` (verde), `pending` (amarelo), `error` (vermelho)
- [ ] Loading states durante redirect e callback
- [ ] Mensagem de sucesso após vinculação concluída

---

## Scope

### IN
- Sandbox Bacen mock (não produção real)
- 4 instituições de teste (BB, Bradesco, Itaú, Nubank sandbox)
- Permissões de leitura: accounts + transactions
- Consent flow completo (initiate → callback → link)
- Desvinculação de conta
- Página de gerenciamento `/settings/connections`

### OUT
- Certificado digital (produção real) — futuro
- Sincronização automática de transações — Story 2.2
- Open Insurance, Open Investment — fora do escopo
- Notificações push de vinculação — futuro
- Multi-conta por instituição — PRO feature futura

---

## Technical Design

### Database Schema (novas tabelas)

```sql
-- Institutions (seed data)
CREATE TABLE of_institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(50) UNIQUE NOT NULL,  -- Bacen institution ID
    name VARCHAR(200) NOT NULL,
    logo_url TEXT,
    authorization_server_url TEXT NOT NULL,
    token_endpoint TEXT NOT NULL,
    accounts_endpoint TEXT NOT NULL,
    is_sandbox BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consent requests
CREATE TABLE of_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES of_institutions(id),
    external_consent_id VARCHAR(200),  -- ID do banco externo
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    -- PENDING | AUTHORIZED | REJECTED | EXPIRED | REVOKED
    permissions TEXT[] NOT NULL DEFAULT '{}',
    state_token VARCHAR(64) NOT NULL,  -- CSRF token
    authorization_url TEXT NOT NULL,
    access_token TEXT,  -- encrypted
    refresh_token TEXT,  -- encrypted
    token_expires_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,  -- consent TTL
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Linked accounts
CREATE TABLE of_linked_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_id UUID NOT NULL REFERENCES of_consents(id),
    institution_id UUID NOT NULL REFERENCES of_institutions(id),
    external_account_id VARCHAR(200) NOT NULL,
    account_type VARCHAR(50),  -- CHECKING | SAVINGS | CREDIT
    account_number_last4 VARCHAR(4),
    owner_name VARCHAR(200),
    currency VARCHAR(3) DEFAULT 'BRL',
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, institution_id, external_account_id)
);
```

### API Endpoints

```
GET    /open-finance/institutions          # Lista instituições disponíveis
POST   /open-finance/consent/initiate      # Inicia consent flow
GET    /open-finance/consent/callback      # Callback OAuth2 do banco
GET    /open-finance/accounts              # Lista contas vinculadas
DELETE /open-finance/accounts/{id}         # Desvincula conta
```

### Backend File Structure

```
apps/api/
├── routes/
│   └── open_finance.py        # Todos os endpoints acima
├── models/
│   └── open_finance.py        # SQLAlchemy models (3 novas tabelas)
├── schemas/
│   └── open_finance.py        # Pydantic v2 schemas
├── services/
│   └── open_finance_service.py # Business logic + OAuth2 client
├── utils/
│   └── encryption.py          # Token encryption/decryption (Fernet)
└── data/
    └── sandbox_institutions.json  # Seed data das 4 instituições
```

### Frontend File Structure

```
apps/web/
├── app/settings/connections/
│   └── page.tsx               # Página principal de conexões
├── components/open-finance/
│   ├── institution-card.tsx   # Card de instituição
│   ├── linked-account-card.tsx # Card de conta vinculada
│   ├── consent-loading.tsx    # Loading durante OAuth flow
│   └── disconnect-modal.tsx   # Modal de confirmação de desvinculação
├── lib/api/
│   └── open-finance.ts        # API client functions
└── stores/
    └── connections.ts         # Zustand store para linked accounts
```

### OAuth2 Flow

```
User → POST /consent/initiate
     ← { authorization_url, consent_id }
User → browser redirect para authorization_url (banco)
User → autoriza no banco
Bank → GET /consent/callback?code=X&state=Y
     ← troca code por token
     ← busca accounts
     ← salva linked_account
User ← redirect para /settings/connections?success=true
```

### Security Considerations
- `state_token`: 32 bytes random, armazenado no consent, validado no callback
- Access tokens: criptografados em repouso com Fernet (symmetric encryption)
- Consent TTL: 30 minutos para o fluxo OAuth (não o token de acesso)
- Rate limiting: 3 consents/hora por user_id

---

## Dev Notes

- Usar `httpx.AsyncClient` para chamadas externas (já no projeto, Story 1.7)
- Sandbox Bacen: usar mock server local ou `.env` com URLs de teste
- Fernet key: adicionar `ENCRYPTION_KEY` nas env vars (Render + local `.env`)
- Migrations: usar Alembic (verificar se já configurado) ou scripts SQL raw
- O callback URL deve ser configurável via `OPEN_FINANCE_CALLBACK_URL` env var
- Para sandbox: simular resposta do banco com fixtures em `tests/fixtures/`

---

## Test Plan

### Unit Tests (pytest)
- [ ] `test_initiate_consent` — cria consent com estado PENDING
- [ ] `test_callback_success` — processa code, salva conta vinculada
- [ ] `test_callback_csrf_fail` — state inválido retorna 400
- [ ] `test_callback_expired` — consent expirado retorna 410
- [ ] `test_basic_plan_limit` — 2ª conta retorna 403 no plano BASIC
- [ ] `test_unlink_account` — remove vinculação, revoga consent

### E2E Tests (Playwright)
- [ ] Fluxo completo: selecionar instituição → autorizar → conta aparece em /settings/connections
- [ ] Desvinculação: modal → confirmar → conta removida da lista

---

## CodeRabbit Integration

**Predicted issues:**
- OAuth state validation bypass (CRITICAL — must review)
- Token stored in plaintext (CRITICAL — Fernet required)
- Missing rate limiting on consent initiation (HIGH)
- httpx timeout not set (MEDIUM)

**Quality gates:**
- `@qa` must verify CSRF protection is functional
- `@qa` must verify tokens are encrypted at rest
- `@architect` review recommended for OAuth2 flow design

---

## Definition of Done

- [ ] Todos os ACs verificados
- [ ] Migrations aplicadas (sandbox + CI)
- [ ] Testes unitários passando (pytest)
- [ ] Testes E2E passando (Playwright)
- [ ] `ENCRYPTION_KEY` documentado em `.env.example`
- [ ] CodeRabbit: sem issues CRITICAL/HIGH
- [ ] `@qa` gate: PASS ou WAIVED com justificativa
- [ ] Branch: `feature/2.1-open-finance-consent`

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-24 | @sm (River) | Story criada — Draft |
| 2026-04-24 | @po (Pax) | Validação 10/10 — Status Draft → Ready (GO) |

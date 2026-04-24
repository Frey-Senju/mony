# Story 2.1 — Open Finance: Consent Flow & Account Linking

**Epic:** 2 — Open Finance & Intelligence  
**Story ID:** 2.1  
**Status:** InReview  
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
| 2026-04-24 | @dev (Dex) | Implementação completa — 13/13 testes passando — Status → Ready for Review |
| 2026-04-24 | @qa (Quinn) | QA Gate executado — Verdict: **CONCERNS** — 3 gaps identificados (encryption fallback, missing happy-path test, missing E2E) |
| 2026-04-24 | @dev (Dex) | QA fix-blockers aplicados — SEC-001 fail-fast (plaintext fallback removido), TEST-001 `test_callback_success` adicionado, DOC-001 `.env.example` atualizado, TEST-002 deferred em NEXT_STEPS.md — Status → InReview |

---

## QA Results

**Reviewer:** @qa (Quinn — Guardian)
**Review Date:** 2026-04-24
**Commit Reviewed:** `80d0cba feat: Open Finance consent flow & account linking [Story 2.1]`
**Branch:** `feature/2.1-open-finance-consent`
**Verdict:** **CONCERNS** (NEEDS_WORK — non-blocking for sandbox, but DoD requires remediation before production/main merge)

### AC Traceability Matrix

| AC | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| AC-1 | Listagem instituições + filtro | ✅ PASS | `routes/open_finance.py:161-172` + seed `data/sandbox_institutions.json` (4 bancos) + frontend `institution-card.tsx` + campo search na `page.tsx` |
| AC-2 | Initiate consent, TTL 30min, state CSRF | ✅ PASS | `routes/open_finance.py:178-226`; `state_token = secrets.token_hex(32)` (64 hex chars); `CONSENT_TTL_MINUTES = 30`; status PENDING salvo |
| AC-3 | Callback OAuth2 (code↔token) | ⚠️ CONCERNS | `routes/open_finance.py:232-355` — troca code, valida state, atualiza status. **HIGH:** linhas 304-307 silenciosamente armazenam tokens em plaintext se `ENCRYPTION_KEY` não estiver setado |
| AC-4 | Account linking + plan limits | ✅ PASS | `_check_account_limit` (BASIC=1/PRO=5/PREMIUM=∞); `UniqueConstraint("user_id","institution_id","external_account_id")` evita duplicatas; `GET /accounts` com join à instituição |
| AC-5 | Unlink + revoke best-effort | ✅ PASS | `DELETE /accounts/{id}` (linhas 397-433); revoke wrapped em try/except; filtro `user_id == uid` previne IDOR; histórico preservado (só seta `is_active=False`) |
| AC-6 | Error handling | ⚠️ CONCERNS | Rate limit 3/hora OK; httpx timeout=10s OK; **spec deviation:** consent expirado retorna redirect com `?error=consent_expired` em vez de 410 Gone — UX melhor, porém diverge da spec. Ajustar spec ou código |
| AC-7 | UI `/settings/connections` | ✅ PASS | Página completa; status visual verde/vermelho em `linked-account-card.tsx`; `ConsentLoading` + notifications success/error/warning; confirmação via `DisconnectModal` |

### 7 Quality Checks

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Code review (patterns/readability) | ✅ PASS | Pydantic v2, SQLAlchemy 2.0 Session, type hints completos, TS interfaces explícitas, imports absolutos |
| 2 | Unit tests coverage | ⚠️ CONCERNS | 13/13 funções presentes; **GAP:** `test_callback_success` (happy-path com `httpx` mockado) NÃO implementado — maior branch do callback (linhas 273-355, token exchange + accounts fetch + persist linked_account) está sem cobertura. `test_callback_invalid_state` só verifica status 302/307, não o conteúdo do Location header |
| 3 | Acceptance criteria | ⚠️ CONCERNS | 5/7 PASS, 2/7 CONCERNS (AC-3, AC-6 — ver matriz acima) |
| 4 | No regressions | ✅ PASS | Rotas existentes intactas; router registrado em `main.py:33`; `OpenFinanceConnection` legado preservado (não removido — ver finding #1 abaixo) |
| 5 | Performance | ✅ PASS | httpx async + timeout 10s; `NullPool` para ambiente serverless (Render) |
| 6 | Security (OWASP basics) | ⚠️ CONCERNS | CSRF via state_token OK; IDOR protegido (user_id em todas queries); **HIGH:** fallback silencioso para plaintext; `.env.example` não documenta `ENCRYPTION_KEY`/`OPEN_FINANCE_CALLBACK_URL`/`FRONTEND_URL` (viola DoD linha 266) |
| 7 | Documentation | ⚠️ CONCERNS | Código bem documentado (docstrings, comments). `.env.example` desatualizado (falta 3 env vars novas) |

### Issues

```yaml
storyId: 2.1
verdict: CONCERNS
issues:
  - id: SEC-001
    severity: high
    category: security
    location: apps/api/routes/open_finance.py:304-307
    description: |
      Silent fallback to plaintext storage when ENCRYPTION_KEY is not set.
      If the env var is forgotten in production, OAuth access/refresh tokens
      will be persisted in plaintext — violating the tech design "encrypted at rest"
      clause and AC-3 security requirement. Comment acknowledges the risk but
      no log warning is emitted.
    recommendation: |
      Raise RuntimeError (fail-fast) in non-sandbox environments when ENCRYPTION_KEY
      is missing. Alternatively, emit a CRITICAL log warning and refuse to complete
      the consent flow unless ENVIRONMENT == 'development'.

  - id: TEST-001
    severity: high
    category: tests
    location: apps/api/tests/test_open_finance.py
    description: |
      Story Test Plan requires `test_callback_success` — happy path with httpx mocked
      (code exchange → accounts fetch → linked_account persisted). This test is
      MISSING. The largest branch of the callback (routes/open_finance.py:273-355,
      ~80 lines) has zero unit coverage. Only invalid_state and expired_consent paths
      are tested.
    recommendation: |
      Add test using unittest.mock.patch on httpx.AsyncClient, returning fake token
      response and accounts list. Assert: consent.status == AUTHORIZED, linked_account
      created with correct external_account_id and account_number_last4.

  - id: TEST-002
    severity: high
    category: tests
    location: apps/web/e2e/
    description: |
      DoD line 265 requires passing Playwright E2E tests. Story Test Plan specifies
      two flows: (1) select institution → authorize → appears in /settings/connections;
      (2) disconnect → confirm → removed from list. No e2e specs exist for Open Finance.
    recommendation: |
      Option A (recommended): Add a mock bank server (simple FastAPI app on port 9000)
      with /authorize, /token, /accounts endpoints, spin it up in CI.
      Option B: Use Playwright route interception to stub the bank URL directly.
      Without either, the full consent flow cannot be E2E-tested.

  - id: TEST-003
    severity: low
    category: tests
    location: apps/api/tests/test_open_finance.py:234-241
    description: |
      test_callback_invalid_state only asserts status_code in (302, 307) — any redirect
      would pass. Should assert the Location header contains error=invalid_state.
    recommendation: |
      assert "error=invalid_state" in resp.headers.get("location", "")

  - id: DOC-001
    severity: medium
    category: docs
    location: apps/api/.env.example
    description: |
      DoD line 266: "ENCRYPTION_KEY documentado em .env.example". Atualmente .env.example
      lista apenas DATABASE_URL, JWT_SECRET, ENVIRONMENT. Faltam:
        - ENCRYPTION_KEY (Fernet 32-byte base64)
        - OPEN_FINANCE_CALLBACK_URL
        - FRONTEND_URL
    recommendation: |
      Adicionar as 3 env vars com comentários e um comando de geração de chave Fernet
      (já documentado no docstring de utils/encryption.py).

  - id: ARCH-001
    severity: medium
    category: code
    location: apps/api/database/models.py:501-553 vs 556-663
    description: |
      Tabela legada `openfinance_connections` (modelo OpenFinanceConnection) coexiste
      com as 3 novas tabelas OF* (of_institutions, of_consents, of_linked_accounts).
      Conceitualmente sobrepostas. Pode gerar confusão em futuras stories (2.2 sync).
    recommendation: |
      @architect deve decidir: (a) deprecar OpenFinanceConnection na próxima story;
      ou (b) consolidar os dois esquemas. Documentar a decisão em DECISIONS.md.

  - id: CODE-001
    severity: low
    category: code
    location: apps/api/database/__init__.py:4-24
    description: |
      __init__.py não re-exporta OFInstitution, OFConsent, OFLinkedAccount, ConsentStatus.
      Inconsistência com padrão existente (todos os outros models são exportados).
      Sem impacto runtime — todos os callers usam import direto de database.models.
    recommendation: |
      Adicionar as 4 classes ao __all__ e ao import from .models.
```

### Security Audit (OAuth2-specific)

| Item | Status | Notes |
|------|--------|-------|
| CSRF protection via `state` param | ✅ PASS | 64-hex cryptographic token, validado via DB lookup no callback |
| Authorization code is single-use (only PENDING consents match) | ✅ PASS | Filter `status == PENDING` no callback previne replay |
| Token encryption at rest | ⚠️ HIGH | Fernet implementado, MAS fallback silencioso para plaintext se env var faltar |
| PKCE | ❌ N/A | Não requerido pelo escopo MVP (sandbox) |
| IDOR em unlink | ✅ PASS | `user_id == uid` filter na query |
| Rate limiting | ✅ PASS | 3 consents/hora por user |
| Timeout em chamada externa | ✅ PASS | `httpx.AsyncClient(timeout=10.0)` |
| `redirect_uri` validation | ⚠️ LOW | Usa env var única (`OPEN_FINANCE_CALLBACK_URL`) — OK para sandbox; produção precisará validar whitelist por instituição |

### Regression Check

- ✅ Rotas existentes (auth, transactions, accounts, reports) não modificadas
- ✅ Schema legado preservado (users, accounts, transactions)
- ✅ `main.py` adiciona router sem tocar nos existentes
- ✅ CI existente (`pytest tests/ -v`) capturará os novos testes automaticamente

### Recommendation

**Opção A — Accept CONCERNS e proceder (sandbox-only):**
Documentar os 3 items HIGH como tech debt explícito no `NEXT_STEPS.md` / `DECISIONS.md`. @devops pode pushar o branch; o merge para `main` fica bloqueado até resolução dos HIGH antes de qualquer deploy de produção.

**Opção B — Retornar para @dev (recomendado se o objetivo é "clean PASS"):**
@dev aplica em 30-60min:
1. Fail-fast em `_get_fernet()` se `ENVIRONMENT != 'development'` e `ENCRYPTION_KEY` ausente (SEC-001)
2. Adicionar `test_callback_success` com `httpx` mockado (TEST-001)
3. Atualizar `.env.example` (DOC-001)
4. (Opcional) Strengthen `test_callback_invalid_state` assertions (TEST-003)

E2E (TEST-002) e ARCH-001 podem ser deferidos para stories subsequentes com tickets explícitos, pois exigem infra (mock bank server) que não estava no escopo da 2.1.

**Minha recomendação como @qa:** **Opção B** — os 3 HIGH são rápidos de resolver e removem risco estrutural da code-base antes que vire dívida permanente. Re-review em <1 iteração.

**Não autorizo** merge para `main` enquanto SEC-001 (plaintext fallback) não for endereçado — é um foot-gun de segurança que mascararia um misconfig catastrófico em produção.


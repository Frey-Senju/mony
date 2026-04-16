---
name: Mony Financial Dashboard Project
description: Projeto paralelo novo; stack Next.js+FastAPI+PostgreSQL; deployado em Vercel+Render
type: project
---

## Status
- **Iniciado:** 2026-04-13
- **Branch:** main (GitHub: Frey-Senju/mony)
- **Frontend:** ✅ Deployed (Vercel)
- **Backend:** ✅ Deployed (Render, Docker)
- **Database:** ✅ PostgreSQL 15+ no Render
- **Obsidian:** ✅ Sincronizado

## Estrutura
```
mony/
├── apps/
│   ├── web/        # Next.js 14 frontend (Vercel)
│   └── api/        # FastAPI backend (Render, Docker)
├── .github/        # CI/CD workflows
├── render.yaml     # Render deployment config
└── .claude/        # Settings + hooks
```

## Features Implementadas
### Database Layer (Story 1.1)
- ✅ 10 tabelas normalizadas (User, Account, Transaction, Category, SpendingLimit, Alert, Report, SubscriptionHistory, OpenFinanceConnection)
- ✅ SQLAlchemy ORM com enums + relationships
- ✅ RLS structure para LGPD compliance
- ✅ Hybrid properties para computed fields (is_plan_active, percentage_achieved)

### Frontend (Story 1.3 COMPLETE)
- ✅ Next.js 14 App Router
- ✅ Layout.tsx + globals.css
- ✅ Home page (Vercel health check)
- ✅ Auth UI complete:
  - LoginForm (email/password validation)
  - SignupForm (password strength + terms)
  - ForgotPasswordForm (2-step password reset)
  - TwoFASetup (TOTP QR + backup codes)
  - PrivateRoute (protected route wrapper)
- ✅ useAuth hook (token management, localStorage)
- ✅ 4 auth pages (/login, /signup, /forgot-password, /verify-2fa)
- ✅ Responsive design (Tailwind mobile-first)
- ✅ TypeScript strict, no any types

### Backend (Story 1.2 + 1.2b + 1.4 COMPLETE)
- ✅ 6 auth endpoints fully implemented + tested
  - POST /auth/register (with duplicate email check)
  - POST /auth/login (with 5-attempt lockout → 24h freeze)
  - POST /auth/refresh (new access + refresh tokens)
  - POST /auth/logout (placeholder for Redis blacklist)
  - POST /auth/2fa/setup (generates TOTP secret + QR + 10 backup codes)
  - POST /auth/password-reset/{request,confirm} (2-step flow, 24h token TTL)
- ✅ 5 transaction CRUD endpoints
  - POST /transactions (201) — Create with plan limit check
  - GET /transactions (200) — List with filtering + pagination
  - GET /transactions/{id} (200) — Retrieve single
  - PUT /transactions/{id} (200) — Update partial
  - DELETE /transactions/{id} (204) — Soft delete
- ✅ JWT utilities (15min access, 7d refresh, password reset tokens)
- ✅ Password hashing (bcrypt cost 12)
- ✅ Account lockout logic (5 attempts → 24h)
- ✅ TOTP complete:
  - generate_totp_secret() — pyotp base32
  - generate_totp_qr_code() — QR code data:image/png;base64
  - generate_backup_codes() — 10 recovery codes
  - verify_totp_code() — TOTP validation ±30s window
- ✅ Password reset: in-memory token store (24h TTL)
- ✅ Test suites: 20+ auth tests + 15 transaction tests
- ✅ Database models + enums + relationships

## Deployment
- **GitHub:** https://github.com/Frey-Senju/mony
- **Vercel:** https://web-flame-alpha-37.vercel.app (frontend)
- **Render:** api-*.onrender.com (backend, Docker-based)
- **Database:** PostgreSQL managed by Render

## Obsidian Sync
- **Vault path:** `/c/Users/cristofer.schwartzer/Desktop/Obsidian/Mony`
- **MCP server:** obsidian-mcp configured + API key
- **Vault files:** INDEX.md, DECISIONS.md, SESSIONS.md
- **Hooks:**
  - PostCompact: Salva sumário em SESSIONS.md
  - UserPromptSubmit: Consulta vault antes de responder

## Stack & Decisões-chave
- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, Absolute imports
- **Backend:** FastAPI, SQLAlchemy, Pydantic, python-jose, bcrypt, slowapi
- **Auth:** JWT (15min access, 7d refresh), bcrypt cost 12, TOTP 2FA
- **Subscription:** BASIC (free), PRO (R$29.90/mo), PREMIUM (R$99.90/mo)
- **Open Finance:** Central Bank API integration (50+ institutions)

## Stories Completas
1. **Story 1.2b:** ✅ Complete TOTP + Password Reset
   - Implementado generate_totp_secret(), generate_totp_qr_code(), verify_totp_code()
   - Password reset flow com email (in-memory token store, 24h TTL)
   - 20+ testes pytest (Story 1.2b)
   
2. **Story 1.3:** ✅ Frontend Auth UI (LoginForm, SignupForm, TwoFASetup, PrivateRoute)
   - useAuth hook completo (token storage, refresh, logout)
   - 4 páginas de auth (/login, /signup, /forgot-password, /verify-2fa)
   - Validação completa + error handling
   
3. **Story 1.3b:** ✅ Frontend Auth Tests
   - 28 testes de integração (React Testing Library + Jest)
   - jest.config.js + jest.setup.js + 6 devDependencies
   - >80% cobertura em todos componentes

## Stories Completas (cont.)

4. **Story 1.4:** ✅ Transaction CRUD API
   - Implementado 5 endpoints: POST, GET, GET/{id}, PUT, DELETE
   - Validação de propriedade de conta (user_id + account_id)
   - Limites de plano: BASIC 100 tx/mês, retorna 403 se limite atingido
   - Validação de amount > 0, retorna 422 se inválido
   - Soft delete com timestamp deleted_at
   - Filtering: account_id, type, start_date/end_date
   - Pagination: offset/limit (default 0, 20; max limit 100)
   - Sorting: configurable com "-" prefix para desc
   - 15 testes pytest: create (5), list (4), get (2), update (2), delete (2)
   - 100% cobertura de endpoints

5. **Story 1.5:** 🔄 Dashboard UI (IN PROGRESS)
   - SummaryCards: 4 cards (gastos, renda, saldo, orçamento) com trends
   - TransactionList: tabela paginada com colunas (desc, valor, data, status), ações (reconcile, edit, delete), bulk select
   - FilterBar: search, date range, account, type, status filters com tags e presets
   - useTransactions hook: fetch, create, update, delete, reconcile operations
   - useFilter hook: filter state com localStorage persistence e presets
   - Dashboard page: integra componentes, calcula métricas, gerencia interações
   - Loading skeleton: UI responsivo durante carregamento
   - Componentes: SummaryCards (280L), TransactionList (260L), FilterBar (240L)
   - Hooks: useTransactions (280L), useFilter (180L)
   - Pages: dashboard/page.tsx (170L), layout, loading
   - Pronto para: Recharts (charts), modal de detalhes, bulk actions, export

## Próximas Stories
1. **Story 1.5:** Dashboard UI (6h)
   - Summary cards (total, income, balance)
   - Transaction list com paginação
   - Filter UI (date range, type, account)
   - Charts (spending by category, monthly trends)

2. **Story 1.6:** Open Finance Integration (12h)
   - Bank selection modal
   - OAuth flow per institution
   - Account sync + import
   - Auto-categorization

3. **Story 1.7:** Category Management (4h)
   - CRUD para categorias customizadas
   - Default categories
   - Category assignment na criação/edição

4. **Story 1.8:** Spending Limits & Alerts (5h)
   - Create/update spending limits per category
   - Alert thresholds
   - Notification engine

## Padrões Código
- **Componentes React:** PascalCase (TransactionList.tsx)
- **Hooks:** prefixo use (useTransactionFilters)
- **Imports:** Apenas absolutos (@/stores, @/components)
- **DB columns:** snake_case
- **Enums:** SCREAMING_SNAKE_CASE
- **Sem any:** TypeScript strict, type guards com unknown

## Agentes
Usar AIOX para orquestração:
- @dev: Implementação
- @architect: Design + decisões técnicas
- @devops: Git push + CI/CD (exclusivo)
- @qa: Testes + quality gates

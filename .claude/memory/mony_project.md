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

### Frontend (Story 1.3 pendente)
- ✅ Next.js 14 App Router
- ✅ Layout.tsx + globals.css
- ✅ Home page (Vercel health check)
- 🔄 Auth UI components (pendente)

### Backend (Story 1.2 + 1.2b COMPLETE)
- ✅ 6 auth endpoints fully implemented + tested
  - POST /auth/register (with duplicate email check)
  - POST /auth/login (with 5-attempt lockout → 24h freeze)
  - POST /auth/refresh (new access + refresh tokens)
  - POST /auth/logout (placeholder for Redis blacklist)
  - POST /auth/2fa/setup (generates TOTP secret + QR + 10 backup codes)
  - POST /auth/password-reset/{request,confirm} (2-step flow, 24h token TTL)
- ✅ JWT utilities (15min access, 7d refresh, password reset tokens)
- ✅ Password hashing (bcrypt cost 12)
- ✅ Account lockout logic (5 attempts → 24h)
- ✅ TOTP complete:
  - generate_totp_secret() — pyotp base32
  - generate_totp_qr_code() — QR code data:image/png;base64
  - generate_backup_codes() — 10 recovery codes
  - verify_totp_code() — TOTP validation ±30s window
- ✅ Password reset: in-memory token store (24h TTL)
- ✅ Test suite: 20+ test cases, all endpoints covered
- ✅ Database models + enums

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

## Próximas Stories
1. **Story 1.2b:** Complete TOTP + Password Reset (2h)
   - Implementar generate_totp_secret(), generate_totp_qr_code(), verify_totp_code()
   - Completar password reset flow com email
   - Adicionar testes pytest
   
2. **Story 1.3:** Frontend Auth UI (4-6h)
   - Login/signup forms
   - Password reset flow
   - 2FA activation
   - Protected routes

3. **Story 1.4:** Transaction API (8h)
   - CRUD endpoints
   - Filtering + pagination
   - Category assignment
   - RLS enforcement

4. **Story 1.5:** Dashboard UI (6h)
   - Summary cards
   - Transaction list
   - Charts (Chart.js/Recharts)

5. **Story 1.6:** Open Finance Integration (12h)
   - Bank selection modal
   - OAuth flow per institution
   - Account sync + import

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

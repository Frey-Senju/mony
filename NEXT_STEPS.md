# Próximos Passos — Mony

**Status atual:** Story 1.2 implementada (skeleton pronto para deploy)  
**Data:** 2026-04-16

---

## 🔥 AÇÃO IMEDIATA NECESSÁRIA

### 1. Fazer Manual Deploy no Render

O backend foi atualizado no código, mas Render precisa de um re-deploy:

1. Acesse: https://dashboard.render.com/services
2. Selecione **"mony-api"** (seu serviço backend)
3. Clique no botão **"Manual Deploy"** (no topo à direita)
4. Aguarde 2-3 minutos para build + restart

**Verificar sucesso:**
```bash
curl https://api-mony.onrender.com/health
# Esperado: {"status":"healthy"}
```

**Se falhar:**
- Verifique logs no Render (Services → mony-api → Logs)
- Procure por mensagens de erro na fase "Docker build"
- Common issues: missing environment variables (JWT_SECRET, DATABASE_URL)

---

## ✅ O Que Foi Feito Nesta Sessão

### Backend (Story 1.2)
- ✅ 6 endpoints de autenticação (skeleton + modelos Pydantic)
- ✅ JWT utilities (access + refresh tokens)
- ✅ Password hashing (bcrypt cost 12)
- ✅ Account lockout logic (5 attempts → 24h)
- ✅ Dependencies atualizadas (pyotp, qrcode)
- ✅ Integrado em main.py
- ✅ Committed (1df8075)

### Obsidian Sync
- ✅ Vault structure criada (INDEX.md, DECISIONS.md, SESSIONS.md)
- ✅ Hooks configurados em .claude/settings.json
- ✅ PostCompact: salva sumário em SESSIONS.md
- ✅ UserPromptSubmit: consulta vault antes de responder

### Documentação
- ✅ STORY_1.2_BACKEND_AUTH.md com todos ACs
- ✅ Decisões arquiteturais documentadas (DECISIONS.md)
- ✅ Memória do projeto salva em licitacoes-intel

---

## 🚀 Próximas Stories (Sequência Recomendada)

### Story 1.2b: Complete TOTP + Password Reset (~2h)
**Pré-requisito:** Backend deployed e health check passing

**Tarefas:**
1. Implementar `generate_totp_secret()` em utils/auth.py (com pyotp)
2. Implementar `generate_totp_qr_code()` (com qrcode + base64)
3. Implementar `generate_backup_codes()` (com secrets)
4. Implementar `verify_totp_code()` (com pyotp time window)
5. Completar POST `/auth/2fa/setup` em routes/auth.py
6. Completar password reset flow (send email com token 24h)
7. Testar com pytest

**Files to modify:**
- `apps/api/utils/auth.py` (functions)
- `apps/api/routes/auth.py` (business logic)
- `tests/test_auth.py` (new file)

---

### Story 1.3: Frontend Auth UI (~4-6h)
**Pré-requisito:** Story 1.2 completa e testada

**Tarefas:**
1. Criar componentes de auth:
   - `components/auth/LoginForm.tsx`
   - `components/auth/SignupForm.tsx`
   - `components/auth/ForgotPasswordForm.tsx`
   - `components/auth/TwoFASetup.tsx`

2. Criar páginas de auth:
   - `app/auth/login/page.tsx`
   - `app/auth/signup/page.tsx`
   - `app/auth/forgot-password/page.tsx`
   - `app/auth/verify-2fa/page.tsx`

3. Context/Store para auth:
   - `stores/auth/useAuth.ts` (custom hook)
   - Armazenar tokens no localStorage/cookies
   - Interceptor axios para adicionar Authorization header

4. Protected routes:
   - `components/PrivateRoute.tsx`
   - Redirect para login se não autenticado

5. Testes (React Testing Library)

---

### Story 1.4: Transaction CRUD API (~6-8h)
**Pré-requisito:** Story 1.3 completa

**Tarefas:**
1. Criar routes/transactions.py:
   - POST `/transactions` — create
   - GET `/transactions` — list (com pagination + filtering)
   - GET `/transactions/{id}` — read
   - PUT `/transactions/{id}` — update
   - DELETE `/transactions/{id}` — delete

2. Validações:
   - User ownership (RLS via SQLAlchemy)
   - Plan limits (BASIC: 100 tx/mês)
   - Category must exist
   - Amount > 0

3. Integração com categorias:
   - Auto-categorize via ML (Story 1.7)
   - Manual category override

---

### Story 1.5: Dashboard UI (~6h)
**Pré-requisito:** Story 1.4 completa

**Tarefas:**
1. Dashboard layout:
   - Summary cards (balance, income, expense, savings)
   - Transaction list (recent 10)
   - Charts (expense by category, trend)

2. Components:
   - `components/dashboard/SummaryCard.tsx`
   - `components/dashboard/TransactionList.tsx`
   - `components/dashboard/ExpenseChart.tsx` (Chart.js/Recharts)

3. Responsiveness:
   - Mobile: cards stacked vertically
   - Tablet/Desktop: grid layout
   - Dark mode support (via CSS variables)

---

## 📚 Reference

- **GitHub:** https://github.com/Frey-Senju/mony
- **Vercel (web):** https://web-flame-alpha-37.vercel.app
- **Render (api):** https://api-mony.onrender.com
- **Obsidian vault:** `C:/Users/cristofer.schwartzer/Desktop/Obsidian/Mony`
- **Local:** `c:/Users/cristofer.schwartzer/mony`

---

## 🛠 Tech Stack Summary

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | Next.js 14, React 18, TypeScript, Tailwind | Deployed: Vercel |
| **Backend** | FastAPI, SQLAlchemy, Pydantic, FastAPI | Deployed: Render (Docker) |
| **Database** | PostgreSQL 15+ | Managed by Render |
| **Auth** | JWT (15min access, 7d refresh) | Bcrypt cost 12, TOTP 2FA |
| **Subscription** | BASIC/PRO/PREMIUM | Plan enforcement in middleware |
| **Open Finance** | Central Bank API | 50+ Brazilian institutions |
| **CI/CD** | GitHub Actions | Lint, test, build validation |

---

## ⚙️ Environment Variables

**Render Backend (.env):**
```
DATABASE_URL=postgresql://user:pass@host/dbname
JWT_SECRET=your-secret-key-here
ENVIRONMENT=production
```

**Frontend (Vercel):**
```
NEXT_PUBLIC_API_URL=https://api-mony.onrender.com
```

---

## 📞 Support

- **Questions about implementation:** Consult STORY_1.2_BACKEND_AUTH.md
- **Obsidian notes:** C:/Users/cristofer.schwartzer/Desktop/Obsidian/Mony
- **Memory system:** Check `~/.claude/projects/c--Users.../memory/mony_project.md`

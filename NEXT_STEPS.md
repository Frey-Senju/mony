# Próximos Passos — Mony

**Última atualização:** 2026-11-24  
**Status:** EPIC-001 ✅ | EPIC-002 ✅ | EPIC-003 ✅ | Sprint Estabilização P0 + Apple Liquid Glass ✅

---

## 1. Reativação do Backend no Render (Ação no Painel)

O serviço `mony-api` estava em estado `Failed service` após o período de standby (e o PostgreSQL gratuito do Render expira após 30–90 dias). Para colocá-lo online:

1. **Banco PostgreSQL:**
   - Crie um novo PostgreSQL no Render (ou banco gratuito permanente no **Neon.tech** / **Supabase**, que não expira após 30 dias) e copie a connection string `postgresql://...`.
2. **Variáveis de ambiente em `mony-api` → Environment:**
   - `DATABASE_URL` = sua URL PostgreSQL (obrigatório — `sync: false` no `render.yaml`)
   - `JWT_SECRET` = gerado automaticamente (ou defina string forte 32+ chars)
   - `ENCRYPTION_KEY` = chave Fernet (`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
   - `REDIS_URL` = internal URL do serviço `mony-redis` (que já está **Available**)
   - `FRONTEND_URL` = `https://web-flame-alpha-37.vercel.app`
   - *(Opcional)* `RESEND_API_KEY` = para envio real de e-mails de redefinição de senha
3. **Deploy:**
   - Faça push na `main` (auto-deploy) ou clique em **Manual Deploy → Clear build cache & deploy** em `mony-api`.
   - Exclua o serviço legado `mony` (Python 3, failed deploy há 7 meses) para manter o painel limpo.
4. **Verificação:**
   ```bash
   curl https://mony-api.onrender.com/health
   # Esperado: {"status":"healthy"}
   ```

---

## 2. Roadmap — EPIC-004 (Beta Público & Monetização)

- [ ] **Billing & Planos (Stripe / Mercado Pago):** checkout + webhooks para upgrade BASIC → PRO / PREMIUM (gating já implementado no backend em Transactions, Budgets e Open Finance).
- [ ] **Open Finance Produção:** integrar agregador (Pluggy ou Belvo) para substituir o modo stub (`OF_SYNC_USE_STUB=1`) sem exigir certificado ICP-Brasil próprio.
- [ ] **PostgreSQL RLS (`DEC-003`):** adicionar políticas Row-Level Security via migration Alembic.
- [ ] **Transações Recorrentes Automáticas:** job Celery Beat que gera lançamentos recorrentes a partir de `is_recurring` / `recurring_pattern`.
- [ ] **OCR de Recibos & Entrada em Linguagem Natural (IA):** preencher transações a partir de foto ou texto livre.

---

## Referências

- **GitHub:** https://github.com/Frey-Senju/mony
- **Vercel (web):** https://web-flame-alpha-37.vercel.app
- **Render (api):** https://mony-api.onrender.com
- **Obsidian Vault:** `C:\Users\Crist\Desktop\Mony`

# Story 2.3 — Budgeting: Category Limits & Alerts

**Epic:** 2 — Open Finance & Intelligence  
**Story ID:** 2.3  
**Status:** InProgress  
**Estimated:** 8-10 hours  
**Priority:** P0  
**Depends on:** Story 2.1 ✅ (of_linked_accounts, categoria em transações), Story 2.2 ✅ (sync pipeline)

---

## Overview

Permitir que o usuário defina limites de gasto por categoria (ex: R$500/mês em Alimentação) e receba alertas quando atingir 80% e 100% do limite. Os budgets são calculados sobre as transações do mês corrente (manual + sincronizadas via Open Finance).

**Escopo MVP:**
- Período fixo: mês corrente (sem período customizável — futuro)
- Alertas in-app (toast/badge) — sem push notification (futuro)
- 1 budget por categoria por usuário
- Categorias: as mesmas já usadas em transações (`category` field)

---

## Acceptance Criteria

### AC-1: CRUD de Budgets
- [ ] POST `/budgets` cria um budget
  - [ ] Body: `{ category: string, limit_amount: number, currency: string = "BRL" }`
  - [ ] Retorna `{ id, category, limit_amount, currency, created_at }`
  - [ ] Único budget por categoria por usuário (upsert ou 409 se duplicado)
- [ ] GET `/budgets` lista todos os budgets do usuário com progresso atual
  - [ ] Cada item: `{ id, category, limit_amount, spent_amount, percentage, alert_level, period }`
  - [ ] `period`: `{ month: int, year: int }` — mês corrente
  - [ ] `alert_level`: `"ok"` | `"warning"` (≥80%) | `"exceeded"` (≥100%)
- [ ] PUT `/budgets/{id}` atualiza o `limit_amount`
- [ ] DELETE `/budgets/{id}` remove o budget

### AC-2: Cálculo de Gasto
- [ ] `spent_amount` calculado sobre transações com `type = "expense"` no mês corrente
- [ ] Inclui transações manuais + sincronizadas (Open Finance)
- [ ] Filtro: `user_id` + `category` + mês corrente (jan/2026 = 2026-01-01 a 2026-01-31)
- [ ] Transações `source = "open_finance"` incluídas no cálculo

### AC-3: Alertas de Progresso
- [ ] `percentage` = `spent_amount / limit_amount * 100` (arredondado 2 casas)
- [ ] `alert_level` aplicado conforme thresholds:
  - [ ] `< 80%` → `"ok"`
  - [ ] `≥ 80% e < 100%` → `"warning"`
  - [ ] `≥ 100%` → `"exceeded"`
- [ ] Frontend exibe barra de progresso colorida:
  - [ ] Verde para `"ok"`, amarelo para `"warning"`, vermelho para `"exceeded"`
- [ ] Badge numérico na nav exibe contagem de budgets em `"exceeded"`

### AC-4: UI — Página de Budgets
- [ ] Rota: `/dashboard/budgets`
- [ ] Lista todos os budgets com barra de progresso + valores (gasto / limite)
- [ ] Botão "Novo Budget" → modal com formulário (categoria + valor)
- [ ] Botão editar (ícone lápis) → modal com valor atual pré-preenchido
- [ ] Botão excluir → confirmação inline
- [ ] Empty state quando nenhum budget criado

### AC-5: Integração com Dashboard
- [ ] SummaryCards do dashboard exibe card "Budgets em alerta" com contagem de `warning + exceeded`
- [ ] Card linka para `/dashboard/budgets`

### AC-6: Plano de Usuário
- [ ] Plano BASIC: máximo 3 budgets simultâneos
- [ ] Plano PRO: máximo 10 budgets
- [ ] Plano PREMIUM: ilimitado
- [ ] Ao exceder limite: POST `/budgets` retorna 403 com `{ detail: "Budget limit reached for your plan" }`

---

## Scope

### IN
- Budget mensal por categoria (período fixo = mês corrente)
- Alertas in-app via `alert_level` no response da API
- CRUD completo (criar, listar, editar, excluir)
- Integração com transações existentes (manual + Open Finance)
- Limites por plano (BASIC/PRO/PREMIUM)
- Badge de budgets excedidos no dashboard

### OUT
- Períodos customizáveis (semanal, anual) — futuro
- Notificações push (FCM) / e-mail — futuro
- Rollover de budget para próximo mês — futuro
- Budget por subcategoria — futuro
- Budget compartilhado (família) — futuro

---

## Technical Design

### Database Schema

```sql
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    limit_amount NUMERIC(12, 2) NOT NULL CHECK (limit_amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, category)
);

CREATE INDEX ix_budgets_user_id ON budgets(user_id);
```

> **Nota:** Não há tabela de progresso — `spent_amount` é calculado on-the-fly via query nas transações. Isso garante sempre dados frescos sem overhead de sincronização.

### API Endpoints

```
POST   /budgets              # Criar budget
GET    /budgets              # Listar com progresso calculado
PUT    /budgets/{id}         # Atualizar limit_amount
DELETE /budgets/{id}         # Remover budget
```

### Backend File Structure

```
apps/api/
├── routes/
│   └── budgets.py           # Endpoints CRUD + cálculo de progresso
├── models/
│   └── budget.py            # SQLAlchemy model (tabela budgets)
├── schemas/
│   └── budget.py            # Pydantic v2 schemas (request + response)
└── alembic/versions/
    └── XXXX_add_budgets_table.py  # Migration
```

### Frontend File Structure

```
apps/web/
├── app/dashboard/budgets/
│   └── page.tsx             # Página principal de budgets
├── components/budgets/
│   ├── budget-card.tsx      # Card com barra de progresso
│   ├── budget-form-modal.tsx # Modal criar/editar
│   └── budget-delete-confirm.tsx  # Confirmação exclusão
├── lib/api/
│   └── budgets.ts           # API client functions
└── stores/
    └── budgets.ts           # Zustand store
```

### Lógica de Cálculo (SQL)

```sql
SELECT
    COALESCE(SUM(amount), 0) AS spent_amount
FROM transactions
WHERE
    user_id = :user_id
    AND category = :category
    AND type = 'expense'
    AND date >= DATE_TRUNC('month', CURRENT_DATE)
    AND date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
    AND deleted_at IS NULL;
```

### Limites por Plano

```python
BUDGET_PLAN_LIMITS = {
    UserPlan.BASIC: 3,
    UserPlan.PRO: 10,
    UserPlan.PREMIUM: None,  # ilimitado
}
```

---

## Dev Notes

- `spent_amount` calculado em Python/SQL no request (sem cache) — OK para MVP com volume baixo
- `category` deve fazer match case-insensitive com as categorias das transações
- Usar `ILIKE` ou `.lower()` para comparação de categoria
- Alembic migration: nova tabela `budgets` simples, sem FK para categories (categoria é string livre)
- Frontend: barra de progresso com `clamp(0, 100)` para não ultrapassar visualmente
- `updated_at` atualizado via `onupdate=func.now()` no SQLAlchemy model

---

## Test Plan

### Unit Tests (pytest)

- [ ] `test_create_budget` — cria budget, retorna 201 com campos corretos
- [ ] `test_create_budget_duplicate` — segunda criação na mesma categoria retorna 409
- [ ] `test_list_budgets_with_progress` — `spent_amount` calculado corretamente sobre transações do mês
- [ ] `test_list_budgets_excludes_other_months` — transações de meses anteriores não contam
- [ ] `test_list_budgets_alert_levels` — verifica `"ok"`, `"warning"`, `"exceeded"` nos thresholds corretos
- [ ] `test_update_budget` — PUT atualiza `limit_amount`, retorna 200
- [ ] `test_delete_budget` — DELETE retorna 204, budget não aparece no GET
- [ ] `test_basic_plan_limit` — 4º budget retorna 403 no plano BASIC
- [ ] `test_budget_isolation` — usuário A não vê budgets do usuário B

### E2E Tests (Playwright)

- [ ] Criar budget → aparece na lista com barra de progresso verde
- [ ] Editar limit → barra atualiza com novo percentual
- [ ] Excluir → desaparece da lista
- [ ] Badge no dashboard reflete contagem de `exceeded`

---

## Definition of Done

- [ ] Todos os ACs verificados
- [ ] Migration Alembic criada e aplicada
- [ ] Testes unitários passando (pytest) — mínimo 9 testes
- [ ] Testes E2E passando (Playwright)
- [ ] `@qa` gate: PASS ou WAIVED com justificativa
- [ ] Branch: `feature/2.3-budgeting-limits`
- [ ] Sem regressões nas stories 2.1/2.2

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-15 | @sm (River) | Story criada — Draft |
| 2026-05-15 | @po (Pax) | Validação 10/10 — GO — Status Draft → InProgress |
| 2026-05-15 | @dev (Dex) | Implementação iniciada |

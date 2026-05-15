# Story 2.5: Financial Goals — Tracking & Progress

**Epic**: EPIC-002 — Open Finance & Intelligence  
**Status**: InProgress  
**Points**: 5  
**Created**: 2026-05-15  
**Branch**: `feature/2.5-financial-goals`

---

## Description

Como usuário, quero criar metas financeiras (ex: "Reserva de emergência: R$ 10.000") e acompanhar meu progresso com visualização clara, para manter disciplina e motivação nos meus objetivos.

---

## Acceptance Criteria

- **AC-1**: `POST /goals` — cria meta com nome, valor-alvo, valor inicial (opcional) e prazo (opcional)
- **AC-2**: `GET /goals` — lista metas ativas com `progress_pct`, `remaining_amount` e `is_achieved`
- **AC-3**: `PUT /goals/{id}` — atualiza nome, valor-alvo, prazo
- **AC-4**: `PATCH /goals/{id}/deposit` — adiciona valor ao `current_amount`; seta `achieved_at` quando `current_amount >= target_amount`
- **AC-5**: `DELETE /goals/{id}` — soft-delete (is_active = False)
- **AC-6**: Página `/dashboard/goals` exibe GoalCards com barra de progresso e botão "Depositar"
- **AC-7**: Link "Metas" acessível na navegação do dashboard

---

## Scope

**IN:**
- CRUD de metas financeiras
- Depósito incremental de valores
- Progresso visual (barra + percentual)
- Soft-delete

**OUT:**
- Integração com transações reais (metas são rastreadas manualmente)
- Notificações push ao atingir meta
- Histórico de depósitos

---

## Dependencies

- EPIC-001 ✅ (auth, transactions)
- Story 2.3 ✅ (budgets — padrões de API reutilizados)
- `goals` table já existente em `models.py`

---

## Dev Notes

- Sem migration necessária: tabela `goals` já está em `models.py` / `Base.metadata.create_all()`
- `achieved_at` é setado automaticamente no PATCH /deposit quando `current >= target`
- Progresso: `progress_pct = (current / target) * 100`, limitado visualmente a 100%
- Frontend: DepositModal separado do GoalFormModal para UX mais clara

---

## Change Log

| Date | Agent | Action |
|------|-------|--------|
| 2026-05-15 | @sm | Story criada |
| 2026-05-15 | @po | GO — validado 9/10 |
| 2026-05-15 | @dev | Implementação iniciada |

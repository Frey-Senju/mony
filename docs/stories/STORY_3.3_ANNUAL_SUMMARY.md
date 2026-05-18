# Story 3.3 — Resumo Anual (12 meses)

**Epic:** EPIC-003 — Relatórios Avançados + Export
**Status:** Done
**Branch:** feature/3.1-custom-date-range

---

## Objetivo

Visualização consolidada dos 12 meses de um ano com gráfico de linha e tabela.

---

## Acceptance Criteria

- [x] AC-1: `GET /reports/annual-summary?year=YYYY` retorna 12 meses com zeros para meses sem dados
- [x] AC-2: Response inclui campo `totals` (income, expenses, net anuais)
- [x] AC-3: Página `/dashboard/reports/annual` com seletor de ano (prev/next)
- [x] AC-4: LineChart Recharts com Receitas, Despesas, Saldo
- [x] AC-5: Tabela com todos os 12 meses + linha de totais
- [x] AC-6: Tabs "Mensal / Anual" na página de relatórios

---

## Mudanças

### Backend
- `apps/api/routes/reports.py`: endpoint `GET /reports/annual-summary`
- `apps/api/tests/test_reports_daterange.py`: +2 testes annual

### Frontend
- `apps/web/app/dashboard/reports/annual/page.tsx` (criado)
- `apps/web/app/dashboard/reports/page.tsx`: tabs Mensal/Anual

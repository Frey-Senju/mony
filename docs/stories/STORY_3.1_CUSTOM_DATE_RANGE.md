# Story 3.1 — Filtro por Período Customizado

**Epic:** EPIC-003 — Relatórios Avançados + Export
**Status:** Done
**Branch:** feature/3.1-custom-date-range

---

## Objetivo

Permitir que o usuário filtre relatórios por qualquer intervalo de datas (ex: "1 Jan → 31 Mar"), não só por mês calendário.

---

## Acceptance Criteria

- [x] AC-1: `GET /reports/monthly-summary` aceita `start_date` + `end_date` como alternativa a `year` + `month`
- [x] AC-2: `GET /reports/category-breakdown` aceita `start_date` + `end_date`
- [x] AC-3: Retrocompatibilidade: year+month continua funcionando
- [x] AC-4: start_date > end_date → 422; apenas um dos dois → 422; nenhum → 422
- [x] AC-5: Response inclui campo `period: { start, end }` em ISO date
- [x] AC-6: Frontend tem toggle "Por Mês" / "Período" na página de relatórios
- [x] AC-7: Modo Período: dois inputs de data + botão "Aplicar"

---

## Mudanças

### Backend (`apps/api/routes/reports.py`)

- Adicionado `ReportPeriod(BaseModel)` com `start: str` e `end: str`
- Adicionado `_resolve_date_range()` helper: valida e retorna `(start, exclusive_end, period)`
- `year` e `month` tornados opcionais em ambos os endpoints
- Novos params: `start_date: Optional[date]`, `end_date: Optional[date]`
- Campo `period: ReportPeriod` adicionado às duas responses

### Backend Tests (`apps/api/tests/test_reports_daterange.py`)

7 testes, todos passando:
1. `test_monthly_summary_year_month_backward_compat`
2. `test_monthly_summary_date_range`
3. `test_category_breakdown_date_range`
4. `test_invalid_range_returns_422`
5. `test_cross_month_range_sums_correctly`
6. `test_missing_one_date_param_returns_422`
7. `test_no_params_returns_422`

### Frontend

- Criado `apps/web/lib/api/reports.ts` com `ReportParams` type e funções centralizadas
- Atualizado `apps/web/hooks/useReports.ts`: `fetchReports(params: ReportParams)` (era `fetchReports(year, month)`)
- Atualizado `apps/web/__tests__/useReports.test.ts`
- Atualizado `apps/web/app/dashboard/reports/page.tsx`: toggle Por Mês / Período + DateRangePicker

---

## Decisões

- Half-open interval `[start, end+1day)` — consistente com o comportamento existente do `month_range`
- Modo range não dispara fetch automaticamente — requer clicar "Aplicar" para evitar fetches parciais durante digitação

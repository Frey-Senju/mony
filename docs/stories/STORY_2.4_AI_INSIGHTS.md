# Story 2.4 — AI Insights: Pattern Analysis Dashboard

**Epic:** 2 — Open Finance & Intelligence  
**Story ID:** 2.4  
**Status:** InProgress  
**Estimated:** 6-8 hours  
**Priority:** P1  
**Depends on:** Story 2.3 ✅ (budgets, categorias), Story 2.1 ✅ (linked accounts)

---

## Overview

Exibir insights automáticos de padrões de gasto do usuário — top categorias, tendências mês a mês e anomalias — usando lógica de negócio (sem ML real, conforme nota do EPIC-002 MVP). Inclui auto-categorização por keywords para sugerir categorias ao criar transações.

**Abordagem MVP:** Rule-based engine (sem modelo de ML). Insights calculados on-the-fly sobre as tabelas existentes (`transactions`, `transaction_categories`, `categories`).

---

## Acceptance Criteria

### AC-1: Top Categorias
- [ ] GET `/insights/monthly` retorna top 3 categorias de gasto do mês atual
- [ ] Cada item: `{ category, total, percentage_of_expenses }`
- [ ] Ordenado por `total` decrescente

### AC-2: Tendência Mês a Mês
- [ ] GET `/insights/monthly` inclui `trend`:
  - [ ] `current_month_expenses`: total de despesas do mês corrente
  - [ ] `previous_month_expenses`: total do mês anterior
  - [ ] `pct_change`: variação percentual (positivo = aumento, negativo = redução)
  - [ ] `trend_direction`: `"up"` | `"down"` | `"stable"` (±5% = stable)

### AC-3: Detecção de Anomalias
- [ ] GET `/insights/monthly` inclui `anomalies`: lista de categorias onde gasto atual > 150% da média dos últimos 3 meses
- [ ] Cada anomalia: `{ category, current_month, avg_3m, ratio }`
- [ ] Usuários com menos de 2 meses de histórico: `anomalies: []` (sem dados suficientes)

### AC-4: Auto-categorização
- [ ] GET `/insights/auto-categorize?description=X&merchant=Y` sugere categoria por keywords
- [ ] Response: `{ category: string | null, confidence: "high" | "low" | "none" }`
- [ ] `confidence: "high"` quando keyword exata encontrada; `"low"` quando correspondência parcial; `"none"` quando sem match
- [ ] Dicionário cobre mínimo 8 categorias comuns (Alimentação, Transporte, Saúde, etc.)

### AC-5: UI — Página de Insights
- [ ] Rota: `/dashboard/insights`
- [ ] Card "Top Categorias" com top 3 + barra visual de proporção
- [ ] Card "Tendência" com seta para cima/baixo/estável + percentual
- [ ] Card "Anomalias" com lista de categorias em alerta (ou "Sem anomalias" se vazia)
- [ ] Gráfico de linha com despesas mensais dos últimos 6 meses (reusar `reports/monthly-summary`)
- [ ] Loading skeleton durante fetch

### AC-6: Integração com DashboardNav
- [ ] Link "Insights" adicionado ao `DashboardNav`
- [ ] Badge numérico exibe contagem de anomalias quando `anomalies.length > 0`

---

## Scope

### IN
- Insights rule-based (sem ML)
- Top 3 categorias do mês atual
- Tendência MoM (mês atual vs anterior)
- Anomalias (>150% da média 3 meses)
- Auto-categorização por keyword (8+ categorias)
- Página `/dashboard/insights` com gráfico histórico
- Badge de anomalias na nav

### OUT
- Modelo de ML real — futuro (Story 2.4b ou EPIC-003)
- Notificações push de anomalias — futuro
- Insights por conta vinculada (Open Finance specific) — futuro
- Recomendações de corte de gastos — futuro

---

## Technical Design

### API Endpoints

```
GET /insights/monthly                                     # Todos os insights do mês
GET /insights/auto-categorize?description=X&merchant=Y   # Sugestão de categoria
```

### Response Schema: `/insights/monthly`

```json
{
  "period": { "month": 5, "year": 2026 },
  "top_categories": [
    { "category": "Alimentação", "total": 850.00, "percentage_of_expenses": 42.5 }
  ],
  "trend": {
    "current_month_expenses": 2000.00,
    "previous_month_expenses": 1750.00,
    "pct_change": 14.3,
    "trend_direction": "up"
  },
  "anomalies": [
    { "category": "Lazer", "current_month": 600.00, "avg_3m": 200.00, "ratio": 3.0 }
  ]
}
```

### Keyword Dictionary (auto-categorize)

```python
KEYWORD_MAP = {
    "Alimentação": ["mcdonalds", "ifood", "rappi", "burger", "restaurante", "padaria", "mercado", "supermercado", "carrefour", "extra"],
    "Transporte": ["uber", "99pop", "cabify", "combustivel", "gasolina", "onibus", "metro", "estacionamento"],
    "Saúde": ["farmacia", "drogaria", "medico", "clinica", "hospital", "exame", "laboratorio"],
    "Lazer": ["netflix", "spotify", "cinema", "teatro", "show", "bar", "balada"],
    "Educação": ["udemy", "coursera", "escola", "faculdade", "curso", "livro", "amazon"],
    "Moradia": ["aluguel", "condominio", "energia", "agua", "gas", "internet", "telefone"],
    "Vestuário": ["zara", "hm", "renner", "riachuelo", "shopping", "roupa", "calcado"],
    "Viagem": ["airbnb", "booking", "hotel", "passagem", "aeroporto", "companhia aerea"],
}
```

### Backend File Structure

```
apps/api/
├── routes/
│   └── insights.py        # Endpoints + lógica de insights
└── tests/
    └── test_insights.py   # Testes unitários
```

### Frontend File Structure

```
apps/web/
├── app/dashboard/insights/
│   └── page.tsx
├── components/insights/
│   ├── InsightCard.tsx
│   ├── TrendChart.tsx
│   └── AnomalyAlert.tsx
├── hooks/
│   └── useInsights.ts
└── lib/api/
    └── insights.ts
```

---

## Dev Notes

- Reusar `month_range()` de `routes/reports.py` (ou duplicar a helper local)
- Anomalias: calcular média dos 3 meses anteriores (não incluir mês atual)
- `pct_change` = `(current - previous) / previous * 100`; quando `previous == 0` → `pct_change = 100` se `current > 0` else `0`
- `trend_direction`: `"stable"` se `|pct_change| <= 5`; `"up"` se > 5; `"down"` se < -5
- Gráfico histórico: reusar fetch do `reports/monthly-summary` para últimos 6 meses (loop no frontend)
- Auto-categorize: normalizar input (lowercase, remover acentos) antes de comparar

---

## Test Plan

### Unit Tests (pytest)

- [ ] `test_monthly_insights_top_categories` — top 3 em ordem decrescente
- [ ] `test_monthly_insights_trend_up` — MoM aumento > 5%
- [ ] `test_monthly_insights_trend_stable` — MoM ±5%
- [ ] `test_monthly_insights_anomaly_detected` — gasto atual > 150% média 3m
- [ ] `test_monthly_insights_no_anomaly_insufficient_history` — < 2 meses retorna `[]`
- [ ] `test_auto_categorize_high_confidence` — keyword exata → `"high"`
- [ ] `test_auto_categorize_no_match` — sem keyword → `{ category: null, confidence: "none" }`

---

## Definition of Done

- [ ] Todos os ACs verificados
- [ ] Nenhuma migration necessária
- [ ] Testes unitários passando (min 7)
- [ ] TypeScript typecheck limpo
- [ ] `@qa` gate: PASS
- [ ] Branch: `feature/2.4-ai-insights`

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-05-15 | @sm (River) | Story criada — Draft |
| 2026-05-15 | @po (Pax) | Validação 10/10 — GO — Status → InProgress |
| 2026-05-15 | @dev (Dex) | Implementação iniciada |

# EPIC-002: Mony — Open Finance & Intelligence

**Status**: Planning  
**Priority**: P0  
**Created**: 2026-04-24  
**Assigned**: @pm (Morgan)  
**Depends on**: EPIC-001 ✅ DONE

## Overview

Expandir o MVP com integração Open Finance (Central Bank API), budgeting avançado e insights automáticos de gastos. Monetização via plano PRO/PREMIUM (base já modelada em DEC-005).

## Objectives

1. **Open Finance** — Conectar contas bancárias via Open Banking Brasil (50+ instituições)
2. **Budgeting** — Limites de gastos por categoria com alertas
3. **AI Insights** — Análise automática de padrões de gasto
4. **Metas Financeiras** — Tracking de objetivos com progresso visual

## Business Value

- Diferenciação de concorrentes com integração bancária real
- Retenção via insights personalizados
- Upsell para planos PRO/PREMIUM (DEC-005)

## Acceptance Criteria

- [ ] Usuário conecta conta bancária via Open Finance consent flow
- [ ] Transações importadas automaticamente da conta conectada
- [ ] Budgets por categoria com alertas de 80% e 100%
- [ ] Dashboard exibe insights de gasto (top categorias, tendências, anomalias)
- [ ] Metas com barra de progresso e data estimada

## Technical Requirements

- **Open Finance:** Central Bank API (Bacen) — consent flow OAuth2
- **Background jobs:** Celery + Redis para sync periódico de transações
- **AI/ML:** classificação de transações por categoria (modelo leve, on-device ou serverless)
- **Notifications:** push via FCM ou email via Resend

## Stories Candidatas

- [ ] Story 2.1: Open Finance — Consent Flow & Account Linking
- [ ] Story 2.2: Open Finance — Transaction Sync (background jobs)
- [ ] Story 2.3: Budgeting — Category Limits & Alerts
- [ ] Story 2.4: AI Insights — Pattern Analysis Dashboard
- [ ] Story 2.5: Financial Goals — Tracking & Progress

## Dependencies

- EPIC-001 ✅ (Auth, Transactions, Dashboard, Reports, Deploy)
- DEC-006: Open Finance via Central Bank API (já registrada)
- DEC-005: Subscription BASIC/PRO/PREMIUM (enums + DB models prontos)

## Notes

- Open Finance Brasil exige certificado digital para produção (sandbox disponível)
- Celery requer Redis — novo serviço no Render (free tier: `Redis` add-on)
- AI model: testar com regra de negócio simples antes de ML real (MVP approach)

---

**Next Step**: @pm define prioridade das stories → @sm cria Story 2.1

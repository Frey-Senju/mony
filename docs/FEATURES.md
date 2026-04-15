# Mony Features - Complete Financial Dashboard

Baseado em Porquim.ia + Funcionalidades completas de dashboard financeira.

---

## 🎯 Core Features (MVP)

### 1. 📊 Dashboard Executivo
- **Saldo Total** - Sum de todas as contas
- **Balanço Mensal** - Receitas vs Despesas do mês
- **Tendências** - Últimos 3/6/12 meses
- **Widget Cards**:
  - Saldo disponível
  - Gasto do mês
  - Receita do mês
  - Economia/Déficit

**Story**: 1.5 (Dashboard UI)

---

### 2. 💰 Gerenciamento de Transações

#### Registro de Gastos
- Input simples: "Comprei café por R$20" (NLU parsing)
- Input estruturado: Formulário com data/valor/categoria
- Upload de recibo (foto do cupom)
- Entrada por voz (future)
- Quick entry com sugestões

#### Tipos de Transação
- `expense` - Despesa
- `income` - Receita/Salário
- `transfer` - Transferência entre contas
- `investment` - Investimento
- `refund` - Reembolso

#### Categorias Inteligentes
- **Automáticas**: Sugestões baseadas em descrição
- **Subcategorias**: Alimentação → Supermercado, Restaurante, Delivery
- **Personalização**: Criar categorias customizadas
- **Ícones e cores**: Visual organization

**Stories**: 1.4 (API), 1.5 (UI)

---

### 3. 📈 Relatórios Financeiros

#### Monthly Summary
```
Período: Abril 2026
├─ Total Receitas: R$ 5.000,00
├─ Total Despesas: R$ 1.500,00
├─ Saldo: R$ 3.500,00
└─ Transações: 47
```

#### Breakdown by Category
```
Despesas por Categoria:
├─ Alimentação: R$ 450 (30%)
├─ Transporte: R$ 200 (13%)
├─ Saúde: R$ 180 (12%)
├─ Lazer: R$ 320 (21%)
└─ Outros: R$ 350 (24%)
```

#### Comparação Periódica
- Mês anterior vs Mês atual
- Crescimento de gastos em cada categoria
- Variação de receita

#### Gráficos
- Pizza (categoria breakdown)
- Linha (tendência de gastos)
- Barras (comparativo meses)
- Heatmap (gastos por dia da semana)

**Story**: 1.6 (Reports)

---

### 4. 🎯 Limites de Gastos & Alertas

#### Spending Limits
- **Por categoria**: Max R$500/mês em Alimentação
- **Total mensal**: Max R$2.000/mês
- **Por período**: Daily, weekly, monthly limits
- **Alertas em cascata**: 
  - 50% limite → Aviso suave
  - 80% limite → Aviso importante
  - 100% limite → Bloqueio

#### Notificações
- Push notification no app
- Email diário (resumo)
- Alerta ao ultrapassar limite
- Reminder semanal (domingo)

**Story**: 1.4 (Limites), 1.5 (UI)

---

### 5. 🏦 Múltiplas Contas/Carteiras

#### Tipos de Conta
- `checking` - Conta corrente
- `savings` - Poupança
- `credit_card` - Cartão crédito
- `investment` - Conta investimento
- `cash` - Dinheiro físico

#### Features
- Saldo por conta
- Transferências entre contas
- Definir conta padrão
- Arquivar contas antigas

**Story**: 1.4 (API), 1.5 (UI)

---

### 6. 💡 Metas de Poupança

#### Tipos de Meta
- **Valor fixo**: "Economizar R$1.000 até Dez"
- **Percentual**: "Economizar 20% da receita"
- **Recorrente**: "R$500/mês em poupança"

#### Tracking
- Progresso visual (progress bar)
- Previsão de conclusão
- Histórico de contribuições
- Celebração ao atingir meta

**Story**: 1.6+ (Future enhancement)

---

### 7. 📱 Análise de Recibos

#### Upload & OCR
- Tirar foto do recibo
- IA extrai: data, vendor, items, total
- Auto-populate transação
- Armazenar imagem (comprovante)

**Story**: 1.7+ (Future AI feature)

---

### 8. 🔐 Autenticação & Segurança

#### Authentication
- Registro email/senha
- Login seguro
- JWT tokens
- Refresh tokens (7 dias)

#### Security
- Passwords: bcrypt hashing
- HTTPS/TLS
- HttpOnly cookies
- CSRF protection
- Rate limiting

#### Privacy
- LGPD compliance (dados no BR)
- Sem dados de terceiros
- Sem uso de dados para marketing
- Exportar dados (GDPR)

**Story**: 1.2 (Backend), 1.3 (Frontend)

---

### 9. 📊 Análise & Insights (Future)

#### AI Insights
- "Você gastou 15% a mais em alimentação este mês"
- "Oportunidades de economia em [categoria]"
- "Seu gasto médio diário é R$50"
- "Recomendação: Reduzir gastos em [X]"

#### Predictions
- Gasto previsto para fim do mês
- Economia prevista em 12 meses
- Tendências de spending

**Story**: 2.0+ (Phase 2)

---

### 10. 📲 Compartilhamento

#### Family/Couples
- Contas compartilhadas
- Permissões (view/edit)
- Histórico de quem adicionou cada transação
- Resumos compartilhados

**Story**: 2.5+ (Phase 2)

---

## 📐 Data Model Summary

```
users
├─ accounts (múltiplas contas)
├─ transactions (todas as transações)
├─ categories (customizáveis por user)
├─ spending_limits (regras de limite)
├─ goals (metas de poupança)
├─ receipts (imagens de recibos)
├─ notifications (alertas)
└─ audit_log (histórico de ações)
```

---

## 🚀 Roadmap

### Phase 1: MVP (Story 1.1-1.7) - ~2 weeks
- ✅ Database schema
- ✅ Authentication
- ✅ Transaction CRUD
- ✅ Categories
- ✅ Dashboard
- ✅ Reports
- ✅ Limits & Alerts
- ✅ Deployment

### Phase 2: Enhancement (Story 2.0-2.5) - ~2 weeks
- [ ] AI Insights
- [ ] Predictions
- [ ] Family sharing
- [ ] Advanced filtering
- [ ] CSV export/import
- [ ] Mobile app

### Phase 3: Integrations (Story 3.0+) - ~4 weeks
- [ ] Bank API integration
- [ ] Cryptocurrency support
- [ ] Investment tracking
- [ ] WhatsApp bot (like Porquim)
- [ ] Slack notifications

---

## 🎨 UI Pages (Next.js)

```
/
├─ /dashboard          Dashboard executiva
├─ /transactions       Listagem + CRUD
│  ├─ /transactions/new
│  ├─ /transactions/:id/edit
│  └─ /transactions/:id
├─ /accounts          Gerenciar contas
│  ├─ /accounts/new
│  └─ /accounts/:id
├─ /categories        Categorias
├─ /goals             Metas
├─ /reports           Relatórios
│  ├─ /reports/monthly
│  ├─ /reports/category
│  └─ /reports/trends
├─ /limits            Limites de gastos
├─ /settings          Configurações
│  ├─ /settings/profile
│  ├─ /settings/security
│  └─ /settings/notifications
├─ /login             Login page
└─ /register          Registro
```

---

## API Endpoints (FastAPI)

See `docs/API.md` for full endpoint documentation.

**Core Endpoints**:
- `POST /auth/register`, `/auth/login`, `/auth/refresh`
- `GET/POST/PUT/DELETE /api/transactions`
- `GET/POST /api/categories`
- `GET/POST /api/accounts`
- `GET/POST /api/goals`
- `GET /api/spending-limits`
- `POST /api/spending-limits`
- `GET /api/reports/*`
- `POST /api/receipts` (upload)

---

## 📊 Database Tables

Detailed in **Story 1.1** and `docs/database/SCHEMA.md`.

**Main Tables**:
- `users` - 7 columns
- `accounts` - 9 columns
- `transactions` - 10 columns
- `categories` - 6 columns
- `spending_limits` - 8 columns
- `goals` - 10 columns
- `receipts` - 6 columns
- `notifications` - 7 columns
- `audit_log` - 6 columns

---

## 🔧 Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 + React 18 + TypeScript |
| Backend | FastAPI + SQLAlchemy + Pydantic |
| Database | PostgreSQL 15 |
| Charts | Recharts or Chart.js |
| Storage | AWS S3 (receipts) - future |
| Authentication | JWT (python-jose + passlib) |
| Notifications | Email (SendGrid) - future |

---

## ✅ Success Metrics

- **MVP Launch**: 2 weeks from start
- **User Onboarding**: <2 minutes
- **Transaction Entry**: <10 seconds
- **Report Generation**: <500ms
- **API Response Time**: <200ms
- **Dashboard Load**: <1 second
- **Uptime**: 99.9%
- **Test Coverage**: >80%

---

*Built with Synkra AIOX | CLI First Architecture*

**Next**: Story 1.1 - Design complete database schema

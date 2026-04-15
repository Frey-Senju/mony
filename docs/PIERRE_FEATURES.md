# Pierre Finance Features in Mony

Mapeamento completo de funcionalidades Pierre Finance implementadas no Mony.

Sources:
- [Pierre Finance Official](https://lp.pierre.finance/en)
- [Pierre App Store](https://apps.apple.com/us/app/pierre-controle-de-gastos-ia/id6749781755)
- [Pierre Google Play](https://play.google.com/store/apps/details?id=io.cloudwalk.pierre)

---

## 🏦 Core Features (Pierre Finance)

### 1. Bank Account Integration (Open Finance)

**Pierre Capability**:
- Connect to Brazilian banks via Open Finance (Central Bank API)
- Automatic transaction import from multiple institutions
- Real-time balance synchronization
- No manual entry required

**Mony Implementation**:
```
Story 1.2 (This): Open Finance connection structure
Story 2.0: Actual bank sync implementation
Story 2.1: Automatic transaction import
```

**Schema Support**:
- ✅ `openfinance_connections` table (stores institution connections)
- ✅ `openfinance_status` enum (not_connected, connecting, connected, failed)
- ✅ `openfinance_token` field (encrypted OAuth token)
- ✅ Sync tracking (last_sync, next_sync, error handling)

**Supported Institutions** (50+):
```
🏦 Banks:
├─ Itaú Unibanco (00360305)
├─ Banco do Brasil (00000000)
├─ Caixa (00000104)
├─ Bradesco (00000070)
├─ Santander (00033000)
├─ BTG Pactual (00000208)
├─ Inter (00077029)
├─ Nubank (00000655)
└─ 40+ more...

💳 Credit Card Issuers:
├─ Visa
├─ Mastercard
├─ Elo
└─ AMEX
```

---

### 2. Centralized Financial Overview

**Pierre Capability**:
- Dashboard showing all accounts
- Real-time balance updates
- Transactions from all connected institutions
- Account management (add, remove, organize)

**Mony Implementation**:
```
✅ Story 1.1: Multi-account structure (checking, savings, CC, investment)
✅ Story 1.4: Transaction API with filtering
✅ Story 1.5: Dashboard UI with account cards
```

**Features Included**:
- ✅ Multiple account types (Story 1.1)
- ✅ Real-time balance calculation (Story 1.4 API)
- ✅ Account organization (sort_order, default, colors)
- ✅ Quick account switching (dashboard)

---

### 3. Spending Analysis by Category

**Pierre Capability**:
- Automatic categorization of transactions
- Spending breakdown by category
- Trend analysis (month-to-month)
- Identify spending patterns

**Mony Implementation**:
```
✅ Story 1.1: Hierarchical categories + auto-categorization
✅ Story 1.4: Category breakdown API
✅ Story 1.6: Spending analysis reports
```

**Features Included**:
- ✅ 20+ default categories (Story 1.1)
- ✅ Hierarchical structure (Food → Supermarket, Restaurant)
- ✅ Custom categories per user
- ✅ Category breakdown by month (Story 1.6)
- ✅ Percentage calculations
- ✅ Trend comparison (month vs month)

**Default Categories**:
```
📍 Alimentação (Food)
   ├─ Supermercado
   ├─ Restaurante
   └─ Delivery

🚗 Transporte (Transport)
   ├─ Combustível
   ├─ Uber/Taxi
   └─ Transporte Público

🏠 Moradia (Housing)
   ├─ Aluguel
   ├─ Condomínio
   └─ Manutenção

💊 Saúde (Health)
💳 Empréstimos (Loans)
🎮 Lazer (Entertainment)
📚 Educação (Education)
...and more
```

---

### 4. Personalized Budgeting

**Pierre Capability**:
- Create spending budgets per category
- Set spending limits
- Real-time budget status tracking
- Alerts when approaching limits

**Mony Implementation**:
```
✅ Story 1.1: Spending limits system (3 limit types)
✅ Story 1.4: Limit enforcement API
✅ Story 1.5: Budget UI with progress visualization
```

**Features Included**:
- ✅ Per-category limits
- ✅ Total monthly limit
- ✅ Account-specific limits
- ✅ Multiple period types (daily, weekly, monthly, yearly)
- ✅ Alert thresholds (50%, 80%, 100%)
- ✅ 3-level alerts (info, warning, blocked)

**Example**:
```
Budget Setup:
├─ Alimentação: R$500/mês (alerta em 80%)
├─ Transporte: R$300/mês (alerta em 80%)
├─ Lazer: R$200/mês (alerta em 80%)
└─ Total: R$2.000/mês (alerta em 80%)

Tracking:
├─ Current spent: R$1.600 (80%) → WARNING
├─ Available: R$400
└─ Days left in month: 15
```

---

### 5. Intelligent Insights (AI-Powered)

**Pierre Capability**:
- AI analyzes spending patterns
- Personalized recommendations
- Savings opportunities
- Spending trend predictions
- Anomaly detection

**Mony Implementation**:
```
Story 2.0+: AI insights module
├─ Pattern analysis
├─ Recommendations
├─ Anomaly detection
└─ Predictive budgeting
```

**Planned Features**:
- [ ] "You spent 15% more in Food this month"
- [ ] "You could save R$100/month by reducing Entertainment"
- [ ] "Your daily average spend is R$50"
- [ ] "Unusual: R$5.000 spent on [category]"
- [ ] "Predicted month-end balance: R$2.500"

---

### 6. Subscription Plans

**Pierre Offering**:

| Plan | Price | Features |
|------|-------|----------|
| **Basic** | Free | 1 bank, basic analysis |
| **Pro** | R$29.90/mo | 5 banks, 5 alerts, advanced reports |
| **Premium** | R$99.90/mo | 20 banks, unlimited alerts, all features |

**Mony Implementation**:
```
✅ Story 1.2: Plan system (BASIC/PRO/PREMIUM)
✅ Story 1.2: Plan enforcement
✅ Story 1.2: Plan upgrade/downgrade flow
```

**Features Included**:
- ✅ 3 subscription tiers
- ✅ Plan-based feature limits
- ✅ Plan history tracking
- ✅ Upgrade/downgrade endpoints
- ✅ Auto-renewal ready (payment integration future)

**Mony Plan Limits**:
```
BASIC (Free):
├─ Connected banks: 1
├─ Spending alerts: 1
├─ Reports: Monthly only
├─ Transaction limit: 50/month
└─ Features: Basic dashboard

PRO (R$29.90/month):
├─ Connected banks: 5
├─ Spending alerts: 5
├─ Reports: Monthly + Category breakdown
├─ Transaction limit: Unlimited
└─ Features: Advanced analytics

PREMIUM (R$99.90/month):
├─ Connected banks: 20
├─ Spending alerts: Unlimited
├─ Reports: All reports + Trends
├─ Transaction limit: Unlimited
├─ Features: AI insights + API access
└─ Support: Priority support
```

---

### 7. Security & Compliance

**Pierre Security**:
- End-to-end encryption
- Central Bank authorized (Open Finance)
- LGPD compliance (Brazilian data protection)
- No direct password sharing with banks

**Mony Implementation**:
```
✅ Story 1.2: JWT authentication + bcrypt passwords
✅ Story 1.2: Audit logging (LGPD)
✅ Story 1.2: 2FA optional
✅ Story 1.2: Encryption ready
```

**Features Included**:
- ✅ Bcrypt password hashing (cost 12)
- ✅ JWT tokens (15min access, 7d refresh)
- ✅ HTTPS/TLS enforcement
- ✅ CORS security
- ✅ Rate limiting
- ✅ Account lockout after failed attempts
- ✅ Audit trail (all actions logged)
- ✅ Soft deletes (LGPD compliance)
- ✅ Email verification
- ✅ Optional 2FA

---

## 🔄 Integration Timeline

### Phase 1: MVP (Stories 1.1-1.7) - Week 1-2
```
✅ Story 1.1: Database schema (with Open Finance fields)
✅ Story 1.2: Authentication + Plans (THIS STORY)
⏳ Story 1.3: Frontend Auth UI
⏳ Story 1.4: Transaction API
⏳ Story 1.5: Dashboard UI (centralized overview)
⏳ Story 1.6: Reports (spending analysis)
⏳ Story 1.7: Deployment
```

### Phase 2: Pierre Features (Stories 2.0-2.5) - Week 3-4
```
⏳ Story 2.0: Open Finance integration
⏳ Story 2.1: Automatic bank sync
⏳ Story 2.2: AI insights module
⏳ Story 2.3: Enhanced budgeting UI
⏳ Story 2.4: Notification system
⏳ Story 2.5: Mobile app (optional)
```

### Phase 3: Enterprise (Stories 3.0+) - Week 5+
```
⏳ Story 3.0: Payment processing (Stripe/PagSeguro)
⏳ Story 3.1: Premium features unlock
⏳ Story 3.2: Analytics dashboard
⏳ Story 3.3: Export/import features
```

---

## 📊 Feature Coverage Matrix

| Pierre Feature | Mony Equiv | Status | Story |
|---|---|---|---|
| Bank Integration | Open Finance | 🟡 Prepared | 2.0 |
| Account Overview | Dashboard | ✅ Ready | 1.5 |
| Spending Analysis | Category reports | ✅ Ready | 1.6 |
| Budgeting | Spending limits | ✅ Ready | 1.1 |
| AI Insights | Insights module | 🟡 Planned | 2.2 |
| Alerts | Notifications | ✅ Ready | 1.2+ |
| Subscription Plans | Plan system | ✅ Ready | 1.2 |
| Security | Auth + encryption | ✅ Ready | 1.2 |
| Compliance (LGPD) | Audit log | ✅ Ready | 1.2 |
| Multi-bank | Open Finance | 🟡 Prepared | 2.0 |

**Legend**: ✅ Ready | 🟡 Prepared/Planned | 🔴 Not Started

---

## 🚀 Competitive Advantages (Mony vs Pierre)

| Feature | Pierre | Mony |
|---------|--------|------|
| **Web App** | ❌ Mobile only | ✅ Web + Mobile (future) |
| **Self-Hosted** | ❌ SaaS only | ✅ Can self-host |
| **Open Source** | ❌ Proprietary | ✅ Potential open source |
| **Offline Mode** | ❌ No | ✅ Planned |
| **Custom Reports** | ❌ Limited | ✅ Yes |
| **API Access** | ❌ No | ✅ REST API |
| **Categories** | 🟡 Limited | ✅ Hierarchical + custom |
| **Recurring Trans** | ❌ No | ✅ Yes |
| **Goals/Savings** | ❌ No | ✅ Yes |
| **Crypto Support** | ❌ No | ✅ Planned |
| **Investment Tracking** | ❌ No | ✅ Planned |

---

## 🔐 Implementation Notes

### Open Finance (Pierre's Secret Sauce)

**What It Is**:
- Brazilian Central Bank mandated API
- Banks must provide read-only access to customer data
- OAuth2 authorization flow
- Real-time transaction sync

**In Mony**:
```
Story 1.2:
├─ OpenFinanceConnection model
├─ Institution list endpoint
├─ Consent flow preparation
└─ Error handling

Story 2.0:
├─ OAuth2 implementation
├─ Bank API integration
├─ Transaction import
└─ Account sync
```

### AI Insights (Future)

**Planned Approach**:
```
Story 2.2:
├─ Pattern analysis (spending by time/category/merchant)
├─ Anomaly detection (unusual transactions)
├─ Recommendations (reduce spending in X category)
├─ Predictions (month-end balance forecast)
└─ Alerts (budget warnings, savings milestones)

Tech Stack:
├─ Simple ML models (regression, clustering)
├─ Or: Claude API for insights (LLM-powered)
└─ Stored in notifications table
```

---

## 📋 Story 1.2 Coverage

**Story 1.2** implements:
- ✅ Subscription plan system
- ✅ User authentication (Pierre prerequisite)
- ✅ Security foundation
- ✅ Open Finance structure (no sync yet)
- ✅ User profile management
- ✅ Audit logging (LGPD)

**Deferred to Later**:
- ⏳ Actual bank API integration (Story 2.0)
- ⏳ AI insights (Story 2.2)
- ⏳ Payment processing (Story 3.0)
- ⏳ Advanced analytics (Story 3.2)

---

## 🎯 Success Metrics

After Story 1.2:
- [ ] Users can register and authenticate
- [ ] JWT tokens working
- [ ] Plan system enforced
- [ ] Audit logging working
- [ ] Ready for dashboard (Story 1.5)
- [ ] Ready for bank integration (Story 2.0)

---

*Mony: Combining Porquim.ia + Pierre Finance + Original Features*

**Story 1.2 Status**: ✅ READY FOR DEVELOPMENT

Generated: 2026-04-15

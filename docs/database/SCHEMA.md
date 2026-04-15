# Mony Database Schema

Complete PostgreSQL schema for financial dashboard application.

---

## Overview

**Database**: PostgreSQL 15+  
**Total Tables**: 10  
**Normalization**: 3NF  
**Design Pattern**: Star schema with dimension tables  

---

## Entity Relationship Diagram

```
                    ┌─────────────┐
                    │   Users     │
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┬───────────────┐
           │               │               │               │
      ┌────▼─────┐  ┌─────▼──────┐  ┌────▼────┐  ┌──────▼──────┐
      │ Accounts  │  │ Categories │  │  Goals  │  │ Spending    │
      └────┬─────┘  └─────┬──────┘  └─────────┘  │  Limits     │
           │              │                       └─────────────┘
           │    ┌─────────┼─────────┐
           │    │         │         │
      ┌────▼─────────────┐  │   ┌───▼─────────┐
      │ Transactions     │◄─┴──►│ Trans       │
      │                  │      │ Categories  │
      └──────┬───────────┘      └─────────────┘
             │
             ├─────────────┬─────────────┐
             │             │             │
        ┌────▼──────┐  ┌───▼────┐  ┌───▼─────┐
        │ Receipts  │  │ Notif- │  │ Audit   │
        │           │  │ ations │  │ Log     │
        └───────────┘  └────────┘  └─────────┘
```

---

## Tables

### 1. Users (Usuários)

Store user account information and preferences.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  preferred_currency VARCHAR(3) DEFAULT 'BRL',
  timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
  is_email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);
```

**Indexes**:
```sql
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_deleted_at ON users(deleted_at);
```

**Constraints**:
- Email must be valid format
- Password hash must be bcrypt (60 chars)
- Timezone must be valid IANA timezone

---

### 2. Accounts (Contas)

Multiple account support (checking, savings, credit card, etc.)

```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('checking', 'savings', 'credit_card', 'investment', 'cash')),
  balance DECIMAL(15,2) DEFAULT 0.00,
  currency VARCHAR(3) DEFAULT 'BRL',
  icon VARCHAR(50),
  color VARCHAR(7),
  is_default BOOLEAN DEFAULT FALSE,
  sort_order INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);
```

**Indexes**:
```sql
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_accounts_user_default ON accounts(user_id) WHERE is_default = TRUE AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_accounts_user_name ON accounts(user_id, name) WHERE deleted_at IS NULL;
```

**Constraints**:
- Only 1 default account per user
- Balance can be negative (credit card)
- Currency must be ISO 4217 code (3 chars)
- Color must be valid hex (#RGB or #RRGGBB)

**Examples**:
- Conta Corrente (Checking account)
- Poupança (Savings account)
- Cartão Crédito (Credit card)
- Investimentos (Investment account)
- Dinheiro (Cash)

---

### 3. Categories (Categorias)

Hierarchical transaction categories. Supports system defaults and custom user categories.

```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100),
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(7),
  is_system BOOLEAN DEFAULT FALSE,
  parent_id UUID REFERENCES categories(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);
```

**Indexes**:
```sql
CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_categories_parent_id ON categories(parent_id);
CREATE UNIQUE INDEX idx_categories_user_slug ON categories(user_id, slug) WHERE deleted_at IS NULL;
```

**Constraints**:
- System categories: user_id IS NULL
- User categories: user_id IS NOT NULL
- Slug must be unique per user
- No circular parent-child references

**System Categories** (user_id = NULL):
```
📍 Alimentação (Food)
   ├─ Supermercado (Supermarket)
   ├─ Restaurante (Restaurant)
   └─ Delivery

🚗 Transporte (Transport)
   ├─ Combustível (Fuel)
   ├─ Uber/Taxi
   └─ Transporte Público (Public Transit)

🏠 Moradia (Housing)
   ├─ Aluguel (Rent)
   ├─ Condomínio (Condo fee)
   └─ Manutenção (Maintenance)

💊 Saúde (Health)
   ├─ Farmácia (Pharmacy)
   └─ Médico (Doctor)

🎮 Lazer (Entertainment)
   ├─ Cinema
   ├─ Jogos (Games)
   └─ Streaming

📚 Educação (Education)

💳 Empréstimos (Loans)

💰 Investimento (Investment)

💸 Salário (Salary)

🎁 Presente (Gift)

📱 Utilidades (Utilities)
```

---

### 4. Transactions (Transações)

Core transaction table - every financial movement.

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense', 'transfer', 'investment', 'refund')),
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) DEFAULT 'BRL',
  description VARCHAR(255) NOT NULL,
  notes TEXT,
  transaction_date DATE NOT NULL,
  merchant_name VARCHAR(255),
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_pattern VARCHAR(50),
  is_reconciled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);
```

**Indexes**:
```sql
CREATE INDEX idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
CREATE INDEX idx_transactions_account_date ON transactions(account_id, transaction_date DESC);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
```

**Constraints**:
- Amount must be positive
- Transaction date cannot be future (except recurring)
- Type must be one of: income, expense, transfer, investment, refund
- Description required (no empty transactions)

**Types**:
- `income` - Salary, bonus, interest
- `expense` - Regular spending
- `transfer` - Between own accounts
- `investment` - Investment purchase
- `refund` - Money returned

---

### 5. Transaction-Category Junction

Many-to-many relationship. Supports split transactions.

```sql
CREATE TABLE transaction_categories (
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  percentage DECIMAL(5,2) DEFAULT 100.00 CHECK (percentage > 0 AND percentage <= 100),
  PRIMARY KEY (transaction_id, category_id)
);
```

**Example** (Split transaction):
```
Transaction: Groceries R$100
├─ Alimentação/Supermercado: 70% (R$70)
└─ Higiene (Custom): 30% (R$30)
```

---

### 6. Spending Limits (Limites de Gastos)

User-defined spending limits with alerts.

```sql
CREATE TABLE spending_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  limit_type VARCHAR(20) NOT NULL CHECK (limit_type IN ('category', 'account', 'total')),
  period VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (period IN ('daily', 'weekly', 'monthly', 'yearly')),
  limit_amount DECIMAL(15,2) NOT NULL CHECK (limit_amount > 0),
  current_spent DECIMAL(15,2) DEFAULT 0.00,
  alert_threshold DECIMAL(5,2) DEFAULT 80.00 CHECK (alert_threshold > 0 AND alert_threshold <= 100),
  is_active BOOLEAN DEFAULT TRUE,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes**:
```sql
CREATE INDEX idx_spending_limits_user_active ON spending_limits(user_id, is_active);
CREATE INDEX idx_spending_limits_period ON spending_limits(period);
```

**Examples**:
```
1. Category limit: Max R$500/month in "Alimentação"
2. Account limit: Max R$2000/month in "Cartão Crédito"
3. Total limit: Max R$3000/month overall

Alert Thresholds:
- 50%: Informational
- 80%: Warning
- 100%: Blocked (optional)
```

---

### 7. Goals (Metas de Poupança)

Savings goals with tracking.

```sql
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  target_amount DECIMAL(15,2) NOT NULL CHECK (target_amount > 0),
  current_amount DECIMAL(15,2) DEFAULT 0.00 CHECK (current_amount >= 0),
  currency VARCHAR(3) DEFAULT 'BRL',
  category_id UUID REFERENCES categories(id),
  target_date DATE,
  icon VARCHAR(50),
  color VARCHAR(7),
  is_active BOOLEAN DEFAULT TRUE,
  achieved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes**:
```sql
CREATE INDEX idx_goals_user_active ON goals(user_id, is_active);
CREATE INDEX idx_goals_target_date ON goals(target_date);
```

**Examples**:
```
1. "Viagem para Europa" - R$10.000 até Dez/2026
2. "Fundo de Emergência" - R$5.000 (no date)
3. "Novo Notebook" - R$3.000 até Jun/2026
4. "Casa Própria" - R$500.000 até 2030
```

---

### 8. Receipts (Recibos)

Store receipt images and OCR-extracted data.

```sql
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_path VARCHAR(255),
  file_size INTEGER,
  mime_type VARCHAR(50),
  extracted_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes**:
```sql
CREATE INDEX idx_receipts_transaction_id ON receipts(transaction_id);
CREATE INDEX idx_receipts_user_id ON receipts(user_id);
```

**Extracted Data** (JSONB):
```json
{
  "vendor": "Carrefour",
  "date": "2026-04-15",
  "items": [
    {"description": "Leite", "quantity": 2, "price": 5.50},
    {"description": "Pão Integral", "quantity": 1, "price": 8.50}
  ],
  "subtotal": 19.50,
  "tax": 0.00,
  "total": 19.50,
  "payment_method": "credit_card"
}
```

---

### 9. Notifications (Notificações)

Alerts for spending limits, goals, etc.

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'custom',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  related_entity_type VARCHAR(50),
  related_entity_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);
```

**Indexes**:
```sql
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
```

**Types**:
- `limit_alert` - Spending limit exceeded
- `goal_progress` - Goal milestone reached
- `daily_summary` - Daily spending summary
- `custom` - User-defined notification

---

### 10. Audit Log (Log de Auditoria)

Track all user actions for security and compliance.

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes**:
```sql
CREATE INDEX idx_audit_log_user_created ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
```

**Actions**:
- `CREATE` - New record
- `UPDATE` - Modified record
- `DELETE` - Deleted record
- `VIEW` - Accessed record (optional)

---

## Query Examples

### Get Monthly Summary
```sql
SELECT 
  DATE_TRUNC('month', t.transaction_date) as month,
  SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) as income,
  SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) as expenses,
  COUNT(*) as transaction_count
FROM transactions t
WHERE t.user_id = $1
  AND t.transaction_date >= DATE_TRUNC('month', CURRENT_DATE)
  AND t.transaction_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
GROUP BY DATE_TRUNC('month', t.transaction_date);
```

### Get Spending by Category
```sql
SELECT 
  c.name,
  c.icon,
  SUM(t.amount) as total,
  COUNT(t.id) as count,
  ROUND(100.0 * SUM(t.amount) / (
    SELECT SUM(amount) 
    FROM transactions 
    WHERE user_id = $1 
      AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE)
  ), 2) as percentage
FROM transactions t
JOIN transaction_categories tc ON t.id = tc.transaction_id
JOIN categories c ON tc.category_id = c.id
WHERE t.user_id = $1
  AND t.type = 'expense'
  AND t.transaction_date >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY c.id, c.name, c.icon
ORDER BY total DESC;
```

### Check Spending Limit Status
```sql
SELECT 
  sl.id,
  sl.category_id,
  sl.limit_amount,
  SUM(t.amount) as current_spent,
  ROUND(100.0 * SUM(t.amount) / sl.limit_amount, 2) as percentage_used,
  CASE 
    WHEN SUM(t.amount) >= sl.limit_amount THEN 'EXCEEDED'
    WHEN SUM(t.amount) >= (sl.limit_amount * sl.alert_threshold / 100) THEN 'WARNING'
    ELSE 'OK'
  END as status
FROM spending_limits sl
LEFT JOIN transactions t ON t.user_id = sl.user_id
  AND t.type = 'expense'
  AND t.transaction_date >= CURRENT_DATE - INTERVAL '1 month'
  AND (sl.category_id IS NULL OR tc.category_id = sl.category_id)
WHERE sl.user_id = $1 AND sl.is_active = TRUE
GROUP BY sl.id;
```

---

## Performance Tuning

### Indexing Strategy

**High-Priority Indexes** (Created):
- `idx_transactions_user_date` - Dashboard queries
- `idx_accounts_user_default` - Account lookup
- `idx_categories_user_slug` - Category search
- `idx_spending_limits_user_active` - Limit checks
- `idx_goals_user_active` - Goal tracking

**Future Indexes** (When needed):
- Partition transactions by user_id (>1M rows)
- Partition transactions by date range (>10M rows)
- Materialized view for daily reports
- Read replica for reporting queries

### Query Optimization

1. **Use database-level aggregations** (SUM, COUNT in SQL)
2. **Avoid N+1 queries** - Use JOINs instead of loops
3. **Index on commonly filtered columns** (user_id, dates)
4. **Materialize expensive calculations** (monthly summaries)
5. **Archive old transactions** (>2 years) to separate table

---

## Data Migration Strategy

### Initial Setup
1. Create schema from migration file
2. Load system categories
3. Create default spending limits
4. Add demo user (development only)

### Backup & Recovery
- Daily automated backups (Render PostgreSQL)
- 30-day backup retention
- PITR (Point-In-Time Recovery) enabled

---

## Security

### Column-Level Encryption
- Passwords: bcrypt (never plaintext)
- Sensitive fields: Consider encryption at rest

### Row-Level Security (Future)
```sql
-- Example RLS policy
CREATE POLICY user_transactions ON transactions
  USING (user_id = current_user_id());
```

### Audit Trail
- All modifications logged in audit_log
- Immutable transaction records (UPDATE/DELETE rare)
- GDPR-compliant data retention

---

## Maintenance

### Regular Tasks
- **Weekly**: Vacuum analyze
- **Monthly**: Check index bloat
- **Quarterly**: Update statistics
- **Yearly**: Archive old transactions

### Monitoring
- Connection count
- Cache hit ratio (>99%)
- Index usage stats
- Slow query log (>1s)

---

*Mony Database Schema v1.0*  
*Last Updated: 2026-04-15*

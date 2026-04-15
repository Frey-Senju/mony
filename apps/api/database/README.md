# Mony Database

Database models and migration management for Mony API.

## Files

- **models.py** - SQLAlchemy ORM models (10 tables)
- **base.py** - Database configuration and session management
- **migrations/** - Database migration files (future: Alembic)

## Database Setup

### Local Development

```bash
# Create PostgreSQL database
createdb mony_dev

# Update DATABASE_URL in apps/api/database/base.py
# Then run from Python:
python -c "from database import init_db; init_db()"
```

### Using SQLAlchemy Core (Direct)

```python
from database import create_tables, SessionLocal
from database.models import User

# Create tables
create_tables()

# Use session
db = SessionLocal()
users = db.query(User).all()
db.close()
```

### Using FastAPI Dependency Injection

```python
from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from database import get_db

app = FastAPI()

@app.get("/users/")
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()
```

## Models Overview

### Core Tables (10)

| Table | Purpose | Rows (Est.) |
|-------|---------|-----------|
| `users` | User accounts | 1M |
| `accounts` | Multiple accounts per user | 5M |
| `transactions` | All financial movements | 100M |
| `categories` | Hierarchical categories | 1K |
| `transaction_categories` | Many-to-many junction | 100M |
| `spending_limits` | Spending limit rules | 10M |
| `goals` | Savings goals | 5M |
| `receipts` | Receipt images/OCR | 50M |
| `notifications` | User notifications | 50M |
| `audit_log` | Audit trail | 200M |

## Indexes

Optimized for common queries:

```
HIGH PRIORITY:
- idx_transactions_user_date (dashboard)
- idx_accounts_user_default (default account)
- idx_spending_limits_user_active (limit checks)

MEDIUM PRIORITY:
- idx_categories_user_slug (category search)
- idx_goals_user_active (goal tracking)
- idx_notifications_user_read (notification fetch)

LOW PRIORITY:
- idx_audit_log_user_created (audit queries)
- idx_receipts_user_id (receipt lookup)
```

## Schema Design

**Full schema documentation**: `docs/database/SCHEMA.md`

### Relationships

```
User
├─ Accounts (1:N)
│  └─ Transactions (1:N)
│     ├─ TransactionCategories (M:N)
│     │  └─ Categories (N:M)
│     └─ Receipts (1:1)
├─ Categories (1:N, hierarchical)
├─ SpendingLimits (1:N)
├─ Goals (1:N)
├─ Notifications (1:N)
└─ AuditLog (1:N)
```

### Constraints

**Data Integrity**:
- Foreign key constraints on all relationships
- NOT NULL on required fields
- UNIQUE constraints for duplicates
- CHECK constraints for ranges/enums

**Business Rules**:
- Amounts must be positive
- Transaction dates not future
- Only 1 default account per user
- Goal current <= target
- Spending limit percentage 0-100

## Common Queries

### Get User's Monthly Summary

```python
from sqlalchemy import func, extract
from database.models import Transaction, TransactionType

db = SessionLocal()

summary = db.query(
    func.sum(
        func.case(
            (Transaction.type == TransactionType.INCOME, Transaction.amount),
            else_=0
        )
    ).label("income"),
    func.sum(
        func.case(
            (Transaction.type == TransactionType.EXPENSE, Transaction.amount),
            else_=0
        )
    ).label("expenses"),
    func.count(Transaction.id).label("transaction_count"),
).filter(
    Transaction.user_id == user_id,
    extract("year", Transaction.transaction_date) == 2026,
    extract("month", Transaction.transaction_date) == 4,
).first()

print(f"Income: {summary.income}, Expenses: {summary.expenses}")
```

### Get Spending by Category

```python
from sqlalchemy import func
from database.models import Transaction, TransactionCategory, Category

db = SessionLocal()

categories = db.query(
    Category.name,
    func.sum(Transaction.amount).label("total"),
    func.count(Transaction.id).label("count"),
).join(
    TransactionCategory,
    TransactionCategory.category_id == Category.id,
).join(
    Transaction,
    Transaction.id == TransactionCategory.transaction_id,
).filter(
    Transaction.user_id == user_id,
    Transaction.type == TransactionType.EXPENSE,
    extract("month", Transaction.transaction_date) == 4,
).group_by(
    Category.id,
    Category.name,
).order_by(
    func.sum(Transaction.amount).desc(),
).all()
```

### Check Spending Limit

```python
from database.models import Transaction, SpendingLimit, TransactionType
from sqlalchemy import func, extract

db = SessionLocal()

limit = db.query(SpendingLimit).filter(
    SpendingLimit.user_id == user_id,
    SpendingLimit.is_active == True,
).first()

if limit:
    current = db.query(
        func.sum(Transaction.amount)
    ).join(
        TransactionCategory,
        TransactionCategory.transaction_id == Transaction.id,
    ).filter(
        Transaction.user_id == user_id,
        TransactionCategory.category_id == limit.category_id,
        Transaction.type == TransactionType.EXPENSE,
        extract("month", Transaction.transaction_date) == 4,
    ).scalar() or 0

    percentage = (current / limit.limit_amount) * 100
    print(f"Spent: {percentage:.1f}% of limit")
```

## Performance Tips

1. **Always use indexes** - Check explain plans
2. **Avoid N+1 queries** - Use eager loading (joinedload, selectinload)
3. **Batch operations** - Use bulk_insert_mappings for large inserts
4. **Archive old data** - Move transactions >2 years old to archive table
5. **Use JSONB** - For flexible fields (receipts.extracted_data)

## Migrations (Future: Alembic)

```bash
# Install Alembic
pip install alembic

# Initialize migrations
alembic init migrations

# Create migration
alembic revision --autogenerate -m "Add column"

# Apply migration
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Environment Variables

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/mony_dev
```

For production (Render):
```bash
DATABASE_URL=postgresql://user:password@hostname:5432/mony_prod
```

## Testing

```python
# Use test database
TEST_DATABASE_URL = "postgresql://user:password@localhost:5432/mony_test"

# Test isolation
@pytest.fixture
def db():
    create_tables()
    yield SessionLocal()
    drop_tables()
```

---

*Mony Database - Story 1.1*

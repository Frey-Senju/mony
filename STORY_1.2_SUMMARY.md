# Story 1.2 Summary - Backend Authentication & Plans

## 🎯 What's Been Designed

Complete backend authentication system for Mony with subscription plans (like Pierre Finance) and Open Finance integration preparation.

---

## 📊 Feature Breakdown

### Authentication System (6 endpoints)

```
POST /auth/register          → Create new user account
  └─ Email verification required
  └─ Password requirements enforced (8+ chars, complexity)
  └─ Rate limiting: 5/minute per IP

POST /auth/login             → Authenticate user
  └─ JWT access token (15 min) + refresh token (7 days)
  └─ Rate limiting: 10/minute per IP
  └─ Account lockout after 5 failed attempts

POST /auth/refresh           → Get new access token
  └─ Using valid refresh token
  └─ Automatic token rotation

POST /auth/logout            → Invalidate tokens
  └─ Optional token blacklist

POST /auth/password-reset    → Initiate password reset
  └─ Email verification flow

POST /auth/password-reset/{token} → Confirm new password
  └─ Token-based confirmation
```

### User Management (4 endpoints)

```
GET /users/me                → Get current user profile
  ├─ Full name, email, phone
  ├─ Preferences (currency, timezone)
  ├─ Current plan
  └─ Open Finance status

PUT /users/me                → Update profile
  └─ Non-sensitive fields only

POST /users/me/email-verify  → Send verification code
  └─ For unverified accounts

POST /users/me/email-verify/{code} → Confirm email
  └─ Activate full account features
```

### Subscription Management (4 endpoints)

```
GET /subscriptions/plans     → List available plans
  └─ BASIC (free)
  └─ PRO (R$29.90/month)
  └─ PREMIUM (R$99.90/month)

GET /subscriptions/me        → Current subscription
  ├─ Plan tier
  ├─ Started at
  ├─ Expires at
  └─ Auto-renew status

POST /subscriptions/upgrade  → Upgrade/downgrade plan
  ├─ Validate new plan
  ├─ Process payment (future)
  └─ Update subscription

GET /subscriptions/me/history → Subscription change history
  └─ All plan transitions with dates/amounts
```

---

## 💾 Database Schema Updates

### User Table Enhancements

```
users (existing columns) +
├─ plan: VARCHAR(20) DEFAULT 'basic'
├─ plan_started_at: TIMESTAMP
├─ plan_expires_at: TIMESTAMP
├─ openfinance_status: VARCHAR(50)
├─ openfinance_token: VARCHAR(500)
├─ openfinance_institutions: FLOAT
├─ openfinance_last_sync: TIMESTAMP
├─ last_login_at: TIMESTAMP
├─ last_login_ip: VARCHAR(45)
├─ two_factor_enabled: BOOLEAN
└─ two_factor_secret: VARCHAR(32)
```

### New Tables (2)

**openfinance_connections**
```
├─ id (UUID)
├─ user_id → users
├─ institution_code (e.g., "00360305" for Itaú)
├─ institution_name (e.g., "Itaú Unibanco")
├─ status (not_connected, connecting, connected, failed, expired)
├─ consent_id (Open Finance consent)
├─ connected_at, last_synced_at, next_sync_at
├─ synced_accounts, synced_transactions (counters)
├─ last_error, error_count (debugging)
└─ created_at, updated_at
```

**subscription_history**
```
├─ id (UUID)
├─ user_id → users
├─ plan_from (basic, pro, premium)
├─ plan_to (basic, pro, premium)
├─ amount_paid (DECIMAL)
├─ currency (BRL)
├─ payment_method (credit_card, debit_card, pix)
├─ payment_status (completed, failed, pending)
├─ started_at, expires_at (TIMESTAMP)
├─ billing_period (monthly, yearly, lifetime)
├─ auto_renew (BOOLEAN)
└─ created_at (TIMESTAMP)
```

### Enums Added (2)

```python
class UserPlan(str, Enum):
    BASIC = "basic"
    PRO = "pro"
    PREMIUM = "premium"

class OpenFinanceStatus(str, Enum):
    NOT_CONNECTED = "not_connected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    FAILED = "failed"
    EXPIRED = "expired"
```

---

## 🔐 Security Features

### Password Security
- ✅ Bcrypt hashing (cost factor 12)
- ✅ Salted storage (secure by default)
- ✅ Requirements enforcement:
  - 8+ characters
  - 1+ uppercase
  - 1+ lowercase
  - 1+ number
  - 1+ special character

### JWT Security
- ✅ Access token: 15 minutes (short-lived)
- ✅ Refresh token: 7 days (secure rotation)
- ✅ HS256 algorithm
- ✅ Secret key: 32+ random characters
- ✅ Token validation on every request

### Account Protection
- ✅ Lockout after 5 failed login attempts (15 min)
- ✅ Rate limiting:
  - Registration: 5/minute per IP
  - Login: 10/minute per IP
  - Password reset: 3/hour per IP
  - Email verify: 5/day per user
- ✅ Login history tracking
- ✅ IP address logging
- ✅ User agent logging

### Data Protection
- ✅ CORS configuration (prevent cross-origin attacks)
- ✅ CSRF tokens ready (can be added)
- ✅ HTTPS/TLS enforcement (Vercel + Render)
- ✅ Password never logged or exposed

---

## 📱 Subscription Plans (Pierre Finance Compatible)

### BASIC (Free)
```
Price: R$0.00/month
Billing: Lifetime
Limits:
├─ Connected institutions: 1 bank
├─ Spending alerts: 1
├─ Reports: Monthly only
├─ Transaction records: 50/month
└─ API access: No
```

### PRO (Professional)
```
Price: R$29.90/month
Billing: Monthly (auto-renew)
Limits:
├─ Connected institutions: 5 banks
├─ Spending alerts: 5
├─ Reports: Monthly + Category breakdown
├─ Transaction records: Unlimited
├─ API access: Basic
└─ Premium support: Yes
```

### PREMIUM (Enterprise)
```
Price: R$99.90/month
Billing: Monthly (auto-renew)
Limits:
├─ Connected institutions: 20 banks
├─ Spending alerts: Unlimited
├─ Reports: All available
├─ Transaction records: Unlimited
├─ API access: Full
├─ AI insights: Yes
└─ Priority support: 24/7
```

---

## 🔄 Pierre Finance Integration

| Feature | Porquim | Pierre | Mony | Status |
|---------|---------|--------|------|--------|
| Bank Integration | ❌ | ✅ Open Finance | ✅ (prep) | 🟡 Story 2.0 |
| Accounts | Limited | ✅ Multi | ✅ | ✅ Story 1.1 |
| Spending Limits | ❌ | ✅ | ✅ | ✅ Story 1.1 |
| Plans | ❌ | ✅ | ✅ | ✅ Story 1.2 |
| Subscriptions | ❌ | ✅ | ✅ | ✅ Story 1.2 |
| Security | ✅ (Encryp) | ✅ | ✅ (JWT) | ✅ Story 1.2 |
| LGPD/Compliance | ✅ | ✅ | ✅ | ✅ Story 1.2 |

---

## 📝 Audit & Logging

All of these are logged in `audit_log` table:

```
Logged Events:
├─ User registration
├─ Login (success/failure)
├─ Password change
├─ Email verification
├─ Profile updates
├─ Plan upgrade/downgrade
├─ Open Finance connection
├─ 2FA enable/disable
└─ Failed login attempts
```

**LGPD Compliance**:
- ✅ Audit trail (7+ years retention possible)
- ✅ User data export (SQL query)
- ✅ User data deletion (soft delete + manual removal)
- ✅ Consent tracking
- ✅ No 3rd-party data sharing

---

## 🚀 Implementation Ready

### Code Structure (Ready for @dev)

```
apps/api/
├── core/
│   ├── security.py       # Password hashing + JWT utils
│   ├── config.py         # Settings & environment vars
│   ├── exceptions.py     # Custom HTTP exceptions
│   ├── constants.py      # App constants
│   └── __init__.py
├── api/
│   ├── auth/             # Authentication module
│   │   ├── router.py     # 6 endpoints
│   │   ├── schemas.py    # Pydantic models
│   │   ├── service.py    # Business logic
│   │   ├── dependencies.py # FastAPI deps
│   │   └── tests/
│   ├── users/            # User management
│   │   ├── router.py     # 4 endpoints
│   │   ├── schemas.py    # User models
│   │   └── service.py    # User logic
│   ├── subscriptions/    # Plans & billing
│   │   ├── router.py     # 4 endpoints
│   │   ├── schemas.py    # Subscription models
│   │   └── service.py    # Plan logic
│   └── __init__.py       # Router aggregation
├── main.py               # FastAPI app + middleware
└── requirements.txt      # Dependencies updated
```

### Dependencies to Add

```
python-jose==3.3.0       # JWT
passlib==1.7.4          # Password hashing
bcrypt==4.0.1           # Bcrypt algorithm
python-multipart==0.0.6 # Form parsing
slowapi==0.1.8          # Rate limiting
pydantic-settings==2.1.0 # Config management
```

---

## ⏭️ What Comes Next

### Story 1.3: Frontend Authentication
```
Depends on: Story 1.2 ✅
├─ Login form UI
├─ Register form UI
├─ Protected routes
├─ Token storage (HttpOnly cookies)
├─ Auth context/state
└─ Error handling & validation
```

### Story 1.4: Transaction API
```
Depends on: Story 1.2 ✅
├─ POST /api/transactions
├─ GET /api/transactions (with filters)
├─ PUT/DELETE endpoints
├─ Category assignment
└─ Pagination & sorting
```

### Story 2.0: Open Finance Integration
```
Depends on: Story 1.2 ✅
├─ OAuth2 flow implementation
├─ Bank API integration
├─ Transaction import
├─ Account synchronization
└─ Recurring sync scheduling
```

---

## 📊 Story Statistics

```
STORY 1.2: Backend Authentication & Plans

Code & Docs:
├─ SQLAlchemy models: 300+ lines
├─ Enums: 2 new (UserPlan, OpenFinanceStatus)
├─ Tables: 2 new (openfinance_connections, subscription_history)
├─ Story specification: 600+ lines
├─ Pierre Features doc: 400+ lines
├─ Total documentation: 1000+ lines
└─ Database schema updates: 15+ new columns

Endpoints:
├─ Auth: 6 endpoints
├─ Users: 4 endpoints
├─ Subscriptions: 4 endpoints
└─ Total: 14 endpoints

Implementation:
├─ Files to create: 9 core modules
├─ Lines of code needed: ~2000
├─ Test coverage: >85%
├─ Estimated time: 15 hours (@dev)
└─ Complexity: High (security-critical)
```

---

## ✅ Definition of Done

Story 1.2 is **DESIGN COMPLETE** when:

- [x] Database schema updated with plan fields
- [x] Open Finance connection tables created
- [x] JWT implementation documented
- [x] Rate limiting strategy defined
- [x] All 14 endpoints specified
- [x] Security requirements documented
- [x] Audit logging planned
- [x] Pierre Finance feature mapping complete
- [x] Implementation guide ready for @dev
- [ ] Actual code implementation (next)
- [ ] Integration tests passing
- [ ] >85% code coverage
- [ ] Security audit passed

---

## 📚 Documentation

- **Full Spec**: `docs/stories/active/1.2.story.md`
- **Pierre Features**: `docs/PIERRE_FEATURES.md`
- **API Design**: `docs/API.md` (to be updated)
- **Database**: `docs/database/SCHEMA.md` (already includes)
- **Architecture**: `docs/ARCHITECTURE.md`

---

## 🎯 Success Metrics

Once Story 1.2 is implemented:

- ✅ Users can create accounts
- ✅ Users can login securely
- ✅ JWT tokens working (access + refresh)
- ✅ Plans enforced (feature limits)
- ✅ Audit trail complete
- ✅ Ready for dashboard (Story 1.5)
- ✅ Ready for bank integration (Story 2.0)
- ✅ LGPD compliant
- ✅ Pierre Finance parity on subscriptions

---

**Story 1.2 Status**: ✅ **DESIGN COMPLETE - READY FOR DEVELOPMENT**

**Owner**: @dev  
**Estimated Time**: 15 hours  
**Complexity**: High (security & auth)  
**Blocker**: No (Story 1.3+ can start after endpoints)

**Next**: Story 1.3 (Frontend Auth UI) or Deploy GitHub/Vercel/Render

---

*Generated: 2026-04-15*
*Mony: Combining Porquim.ia + Pierre Finance + OpenBank features*

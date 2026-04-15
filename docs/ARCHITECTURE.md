# Mony Architecture

## Overview

Mony follows **AIOX CLI-First Architecture**:

```
CLI First → Observability Second → UI Third
```

All features are implemented in the backend API first, then exposed via frontend.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Browser                         │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────┐
│          Vercel (Frontend - Next.js)                    │
│  ├─ app/                                                │
│  ├─ components/                                         │
│  ├─ pages/                                              │
│  └─ lib/                                                │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS (REST API)
                     ▼
┌─────────────────────────────────────────────────────────┐
│          Render (Backend - FastAPI)                     │
│  ├─ api/                                                │
│  │  ├─ auth/                                            │
│  │  ├─ transactions/                                    │
│  │  ├─ categories/                                      │
│  │  └─ reports/                                         │
│  ├─ database/                                           │
│  │  ├─ models.py                                        │
│  │  ├─ sessions.py                                      │
│  │  └─ migrations/                                      │
│  └─ core/                                               │
│     ├─ config.py                                        │
│     ├─ security.py                                      │
│     └─ errors.py                                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│       Render PostgreSQL Database                        │
│  ├─ users                                               │
│  ├─ transactions                                        │
│  ├─ categories                                          │
│  └─ transaction_categories                              │
└─────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend (Vercel)
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI**: React 18 + Custom CSS (no framework initially)
- **State**: TBD (Context/Redux/Zustand)
- **HTTP**: fetch API + custom hooks

### Backend (Render)
- **Framework**: FastAPI
- **Language**: Python 3.11
- **ORM**: SQLAlchemy 2.0
- **Database**: PostgreSQL 15
- **Auth**: JWT (python-jose + passlib)
- **Validation**: Pydantic

### Shared
- **Package**: `@mony/shared`
- **Contents**: TypeScript types, constants, utilities

### Infrastructure
- **Monorepo**: Turbo + npm workspaces
- **CI/CD**: GitHub Actions
- **VCS**: Git + GitHub
- **Secrets**: Vercel/Render managed secrets

## Data Flow

### Authentication Flow
```
User → Login UI → API /auth/login → JWT Token → Store in Cookie → Attach to requests
```

### Transaction Create Flow
```
User → Transaction Form → POST /api/transactions → DB Insert → Response → UI Update
```

### Dashboard Flow
```
User → Dashboard UI → GET /api/transactions → Aggregate → Display Stats
```

## API Endpoints (FastAPI)

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login (get JWT)
- `POST /auth/refresh` - Refresh token
- `POST /auth/logout` - Logout

### Transactions
- `GET /api/transactions` - List user transactions (paginated)
- `POST /api/transactions` - Create transaction
- `GET /api/transactions/{id}` - Get transaction
- `PUT /api/transactions/{id}` - Update transaction
- `DELETE /api/transactions/{id}` - Delete transaction

### Categories
- `GET /api/categories` - List categories
- `POST /api/categories` - Create category
- `PUT /api/categories/{id}` - Update category
- `DELETE /api/categories/{id}` - Delete category

### Reports
- `GET /api/reports/summary` - Monthly summary
- `GET /api/reports/by-category` - Category breakdown
- `GET /api/reports/trends` - Spending trends

### Health
- `GET /health` - Health check

## Database Schema (Story 1.1)

See `docs/database/SCHEMA.md` for full schema design.

### Core Tables
- `users` - User accounts
- `transactions` - Income/expense records
- `categories` - Transaction categories
- `transaction_categories` - Many-to-many relationship

## Development Workflow

1. **Story Creation** (@sm): Create story from epic
2. **Validation** (@po): Validate acceptance criteria
3. **Backend First** (@dev): Implement API endpoints (CLI-First principle)
4. **Frontend** (@dev): Build UI components
5. **Testing** (@qa): Run tests, verify quality gates
6. **Deployment** (@devops): Push to main, auto-deploy

## Deployment Pipeline

```
Local Git → Push to main → GitHub Actions CI/CD → Vercel + Render Deploy
```

### Auto-Deployment

**Frontend (Vercel)**:
- Branch: `main`
- Root dir: `apps/web`
- Build: `npm run build`
- Output: `.next`
- URL: `https://mony-web.vercel.app`

**Backend (Render)**:
- Branch: `main`
- Root dir: `apps/api`
- Build: `pip install -r requirements.txt`
- Start: `python -m uvicorn main:app --host 0.0.0.0 --port $PORT`
- URL: `https://mony-api.onrender.com`

## Security Considerations

### Authentication
- JWT tokens (access + refresh)
- HttpOnly cookies (no XSS exposure)
- Token expiration (15min access, 7d refresh)

### Authorization
- User ID validation on all endpoints
- No cross-user data access
- Role-based access control (future)

### Data Protection
- Password hashing (bcrypt)
- HTTPS only
- CORS restrictions
- Input validation (Pydantic)

### Database
- Connection pooling
- Parameterized queries (SQLAlchemy)
- Row-level security (future)

## Performance Targets

- **Frontend**: Vercel CDN auto-optimization
- **Backend**: Sub-500ms response time
- **Database**: <100ms query time with proper indexes
- **Lighthouse Score**: >90

## Monitoring & Observability

### Logs
- **Frontend**: Vercel built-in logs
- **Backend**: Python logging + FastAPI logs
- **Database**: PostgreSQL query logs

### Metrics
- API response times
- Error rates
- Database connection count
- Frontend load times

### Health Checks
- Frontend: Vercel auto-health
- Backend: `GET /health` endpoint
- Database: Connection pool status

## Scaling Considerations

### Current (MVP)
- Vercel free tier: Suitable
- Render free tier: 0.5 CPU (limited)
- PostgreSQL: 1GB shared (limited)

### Production (Future)
- Vercel Pro or Enterprise
- Render Starter+ ($7/mo) or higher
- PostgreSQL dedicated instance

---

*Built with Synkra AIOX | CLI First Architecture*

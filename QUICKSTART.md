# Mony - Quick Start Guide

Get Mony running locally in 5 minutes.

## Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org/))
- **Python** 3.11+ ([download](https://python.org/))
- **Git**
- **PostgreSQL** 15+ (optional for local DB, can use Render in dev)

## Setup (One-time)

### 1. Clone & Install

```bash
# Navigate to project
cd mony

# Install dependencies
npm install

# Setup frontend
cd apps/web && npm install && cd ../..

# Setup backend
cd apps/api && python -m venv venv
# On Windows: venv\Scripts\activate
# On Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
cd ../..
```

### 2. Environment Variables

```bash
# Copy templates
cp .env.example .env.local
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

### 3. Database (Optional)

For local PostgreSQL development:
```bash
# Create database
createdb mony_dev

# Update apps/api/.env
DATABASE_URL=postgresql://localhost/mony_dev
```

For development without local DB:
- Use Render PostgreSQL (setup in deployment)
- Or skip DB tests temporarily

## Running

### All Services (Recommended)

```bash
npm run dev
```

Opens:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### Individual Services

**Frontend only:**
```bash
cd apps/web && npm run dev
```

**Backend only (with venv activated):**
```bash
cd apps/api && python -m uvicorn main:app --reload
```

## Development Commands

```bash
# Lint
npm run lint

# Type check
npm run typecheck

# Test (when tests exist)
npm test

# Build
npm run build

# Clean everything
npm run clean
```

## API Testing

Once backend is running:

1. **Swagger UI**: http://localhost:8000/docs
2. **ReDoc**: http://localhost:8000/redoc
3. **Health check**: http://localhost:8000/health

## First Steps

### Create a Transaction (via API)

```bash
# 1. Register user (Swagger UI or curl)
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass123",
    "name": "Test User"
  }'

# 2. Login and get token
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass123"
  }'

# 3. Use token in Authorization header for API calls
curl -X POST http://localhost:8000/api/transactions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "expense",
    "amount": 50.00,
    "description": "Coffee",
    "date": "2026-04-15"
  }'
```

## Troubleshooting

### Port Already in Use
```bash
# Find and kill process using port 3000 or 8000
# macOS/Linux:
lsof -i :3000
kill -9 <PID>

# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Python Virtual Environment Issues
```bash
# Deactivate current venv
deactivate

# Remove venv
rm -rf apps/api/venv

# Recreate
cd apps/api
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

### Node Module Issues
```bash
# Clear and reinstall
npm run clean
npm install
cd apps/web && npm install && cd ../..
```

## Documentation

- **Full Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **API Reference**: [docs/API.md](docs/API.md)
- **Deployment**: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Database**: [docs/database/SCHEMA.md](docs/database/SCHEMA.md) (after Story 1.1)

## Next Development

1. **Story 1.1**: Database Schema Design (@architect, @data-engineer)
2. **Story 1.2**: User Authentication Backend (@dev)
3. **Story 1.3**: User Authentication Frontend (@dev)
4. **Story 1.4**: Transaction API (@dev)
5. **Deployment**: Connect Vercel + Render (@devops)

---

**Questions?** Check docs or create a story!

*Built with Synkra AIOX | CLI First*

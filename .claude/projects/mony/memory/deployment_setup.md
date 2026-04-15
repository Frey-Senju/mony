---
name: Deployment Setup - Vercel & Render
description: Configuration for Vercel (web) and Render (api) deployments
type: reference
---

# Deployment Configuration

## Vercel (Frontend)

**What**: Next.js 14 frontend at `apps/web`  
**URL**: https://mony-web.vercel.app (once connected)  
**Deploy Trigger**: Push to `main` branch

**Setup Steps**:
1. Go to https://vercel.com/new
2. Import `mony` GitHub repo
3. Set root directory: `apps/web`
4. Add env var: `NEXT_PUBLIC_API_URL=https://mony-api.onrender.com`
5. Deploy

**Status**: ⏳ Pending GitHub repo + Vercel connection

---

## Render (Backend API)

**What**: FastAPI at `apps/api`  
**URL**: https://mony-api.onrender.com (once connected)  
**Deploy Trigger**: Push to `main` branch

**Setup Steps**:
1. Go to https://dashboard.render.com
2. New → Web Service
3. Connect GitHub repo
4. Set publish dir: `apps/api`
5. Build: `pip install -r requirements.txt`
6. Start: `python -m uvicorn main:app --host 0.0.0.0 --port $PORT`
7. Add env vars: `DATABASE_URL`, `JWT_SECRET`
8. Deploy

**Status**: ⏳ Pending GitHub repo + Render connection

---

## Render PostgreSQL

**What**: Managed PostgreSQL database  
**Replaces**: Local dev database

**Setup**:
1. On Render dashboard: Create PostgreSQL database
2. Copy connection string to `DATABASE_URL` env var in backend
3. Run migrations to create schema

**Status**: ⏳ Pending database creation after Story 1.1

---

## GitHub Actions CI/CD

**File**: `.github/workflows/ci.yml`  
**Triggers**: On push/PR to main/develop

**Steps**:
1. Lint (ESLint + Python flake8)
2. TypeCheck (TypeScript)
3. Test (Jest + pytest)
4. Build (Next.js + FastAPI)

**Status**: ✅ Configured, ready to run

---

## How to Apply

When setting up deployments:
- **Frontend URL** in env: Set `NEXT_PUBLIC_API_URL` to Render API URL
- **Backend URL** in code: Use env var from Render dashboard
- **Secrets**: Store sensitive values in Vercel/Render secret managers, not in code
- **Database**: After Story 1.1, create Render Postgres and connect it

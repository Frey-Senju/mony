# Deployment Guide - Mony

## Architecture Overview

```
GitHub (Source) → CI/CD → Frontend (Vercel) + Backend (Render)
```

## Frontend (Next.js → Vercel)

### Setup on Vercel

1. **Connect Repository**
   - Visit https://vercel.com/new
   - Import `mony` GitHub repository
   - Select `apps/web` as root directory
   - Vercel auto-detects Next.js

2. **Environment Variables**
   - `NEXT_PUBLIC_API_URL` = https://mony-api.onrender.com (production)

3. **Auto-Deploy**
   - Vercel automatically deploys on `main` branch push
   - Preview deploys on pull requests

### Development
```bash
cd apps/web
npm install
npm run dev
# Open http://localhost:3000
```

---

## Backend (FastAPI → Render)

### Setup on Render

1. **Create Web Service**
   - Visit https://dashboard.render.com
   - New → Web Service
   - Connect GitHub repository
   - Set publish directory: `apps/api`

2. **Configuration**
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python -m uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Free tier (or Starter for production)

3. **Environment Variables**
   - `DATABASE_URL` = `postgresql://...` (from Render Postgres)
   - `JWT_SECRET` = Your secret key
   - `ENVIRONMENT` = `production`

4. **Database (PostgreSQL)**
   - Create PostgreSQL database on Render
   - Copy connection string to DATABASE_URL

### Development
```bash
cd apps/api
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python -m uvicorn main:app --reload
# Open http://localhost:8000/docs
```

---

## GitHub Configuration

### Required Secrets (for CI/CD)

1. Go to repository Settings → Secrets and variables → Actions
2. Add:
   - `VERCEL_TOKEN` (from Vercel account)
   - `RENDER_API_KEY` (from Render account)

### Workflows

Files in `.github/workflows/`:
- `ci.yml` - Lint, test, build on every push/PR
- `deploy.yml` - Deploy to Vercel & Render on main push

---

## Deployment Checklist

- [ ] GitHub repository created
- [ ] Repository pushed to GitHub
- [ ] Vercel project connected to `apps/web`
- [ ] Render service connected to `apps/api`
- [ ] Render PostgreSQL database created
- [ ] Environment variables set on Vercel
- [ ] Environment variables set on Render
- [ ] Domain configured (if using custom domain)
- [ ] SSL certificates enabled (auto on Vercel/Render)

---

## Monitoring

### Vercel Dashboard
- https://vercel.com/dashboard
- View deployments, logs, analytics

### Render Dashboard
- https://dashboard.render.com
- View service status, logs, metrics

### Health Checks

**Frontend**: https://mony-web.vercel.app
**Backend**: https://mony-api.onrender.com/health

---

## Rollback

### Vercel
1. Dashboard → Deployments
2. Click previous deployment → Redeploy

### Render
1. Dashboard → Service → Deploys
2. Click previous deploy → Redeploy

---

## Costs

### Vercel
- Free tier: 100GB bandwidth/month
- Suitable for development/small production

### Render
- Free tier: Limited to small apps, 0.5 CPU
- **Upgrading**: Starter plan ($7/month) recommended for production

### Database (Render PostgreSQL)
- Free tier: 1 shared instance (0.25GB)
- **Production**: Recommended to upgrade

---

*Keep this updated as you deploy and learn what works!*

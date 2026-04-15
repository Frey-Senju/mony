# GitHub Setup for Mony

Steps to connect Mony to GitHub and configure deployments.

## 1. Create GitHub Repository

### Option A: Via GitHub Web
1. Go to https://github.com/new
2. **Repository name**: `mony`
3. **Description**: "Money management application"
4. **Visibility**: Public (or Private if preferred)
5. **Initialize**: Do NOT initialize with README (we have one)
6. Click "Create repository"

### Option B: Via GitHub CLI
```bash
gh repo create mony --public --source=. --remote=origin --push
```

## 2. Connect Local Git Repository

```bash
# Add remote
git remote add origin https://github.com/YOUR_USERNAME/mony.git

# Verify
git remote -v

# Push to GitHub
git branch -M main
git push -u origin main
```

## 3. Protect Main Branch (Recommended)

On GitHub:
1. Go to Settings → Branches
2. Add branch protection rule
3. **Pattern**: `main`
4. **Require status checks**: Enable
5. **Require PR reviews**: Enable (at least 1)
6. **Dismiss stale reviews**: Enable

## 4. Setup GitHub Actions Secrets

For CI/CD pipeline (`.github/workflows/ci.yml`):

**GitHub Actions runs automatically on push** - no secrets needed initially.

Future secrets (for deployments):
- Settings → Secrets and variables → Actions
- `VERCEL_TOKEN` (from Vercel)
- `RENDER_API_KEY` (from Render)

## 5. Next: Connect Vercel & Render

### Vercel Setup
```bash
# Login to Vercel
npm i -g vercel
vercel login

# Link project
cd apps/web
vercel link

# Set environment variables
vercel env add NEXT_PUBLIC_API_URL
# Value: https://mony-api.onrender.com (or your Render URL)

# Deploy
vercel deploy --prod
```

**Or via web**: https://vercel.com/new → Import GitHub repo → Select `mony`

### Render Setup
1. Go to https://dashboard.render.com
2. New → Web Service
3. Connect GitHub
4. Select `mony` repository
5. **Name**: `mony-api`
6. **Publish directory**: `apps/api`
7. **Build command**: `pip install -r requirements.txt`
8. **Start command**: `python -m uvicorn main:app --host 0.0.0.0 --port $PORT`
9. **Environment variables**:
   - `DATABASE_URL` (from Render PostgreSQL)
   - `JWT_SECRET` (generate: `openssl rand -hex 32`)
10. Create Web Service

### Render PostgreSQL
1. Dashboard → New → PostgreSQL
2. **Name**: `mony-db`
3. **Region**: Same as API (for latency)
4. Copy connection string to API's `DATABASE_URL`

## 6. Environment Variables Checklist

### Vercel (Frontend)
- [ ] `NEXT_PUBLIC_API_URL` = `https://mony-api.onrender.com`

### Render (Backend)
- [ ] `DATABASE_URL` = PostgreSQL connection string
- [ ] `JWT_SECRET` = Generated secret key (32+ chars)
- [ ] `ENVIRONMENT` = `production`

## 7. Test Deployments

```bash
# Trigger GitHub Actions
git push origin main

# Check status
gh run list

# View logs
gh run view <RUN_ID>
```

### Verify URLs

- **Frontend**: https://mony-web.vercel.app (or your custom domain)
- **Backend**: https://mony-api.onrender.com/health
- **API Docs**: https://mony-api.onrender.com/docs

## 8. Domain Configuration (Optional)

### Vercel Custom Domain
1. Settings → Domains
2. Add domain
3. Update DNS records (Vercel provides instructions)

### Render Custom Domain
1. Service Settings → Custom Domains
2. Add domain
3. Update DNS CNAME record

---

## Troubleshooting

### Build Fails on Vercel
- Check build logs: Vercel Dashboard → Deployments
- Common: Missing env vars
- Solution: Add to Vercel Environment Variables

### Build Fails on Render
- Check deploy logs: Render Dashboard → Deploys
- Common: Python dependencies, missing DATABASE_URL
- Solution: Fix requirements.txt or env vars

### App Won't Start
- Check health endpoint: `https://mony-api.onrender.com/health`
- Check logs: Render Dashboard → Logs
- Common: Database connection timeout
- Solution: Verify DATABASE_URL and Render Postgres status

---

**You're ready to deploy!** 🚀

Next: @architect/@data-engineer design database schema (Story 1.1)

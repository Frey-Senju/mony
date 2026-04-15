# 🚀 Deploy Step-by-Step Guide

Complete this checklist to deploy Mony to production.

**Estimated Time**: 45 minutes  
**Prerequisites**: GitHub account, Vercel account, Render account

---

## ✅ Part 1: GitHub Repository (10 min)

### Option A: Using GitHub CLI (Fastest)

```bash
cd /c/Users/cristofer.schwartzer/mony

# Check if gh is installed
gh --version

# If not installed, install via:
# npm install -g gh (or use Windows Package Manager)

# Create repo and push
gh repo create mony --public --source=. --remote=origin --push
```

**Result**: ✅ Repo created at `https://github.com/YOUR_USERNAME/mony`

### Option B: Manual via GitHub Web

1. Go to https://github.com/new
2. **Repository name**: `mony`
3. **Description**: "Money management application with Porquim.ia & Pierre Finance features"
4. **Visibility**: Public
5. Click **Create repository**
6. Copy the commands shown and run:

```bash
cd /c/Users/cristofer.schwartzer/mony
git remote add origin https://github.com/YOUR_USERNAME/mony.git
git branch -M main
git push -u origin main
```

### Verify ✅

```bash
# Check remote
git remote -v
# Should show: origin https://github.com/YOUR_USERNAME/mony.git

# Check on GitHub
# Visit: https://github.com/YOUR_USERNAME/mony
# Should see all files and 9 commits
```

---

## ✅ Part 2: Vercel Deployment (15 min)

### Step 1: Create Vercel Project

**Via CLI** (Fastest):
```bash
npm install -g vercel
vercel login

cd apps/web
vercel link

# Follow prompts:
# ✓ Link to existing project? No
# ✓ What's your project's name? mony-web
# ✓ In which directory is your code? ./
```

**Or Via Web**:
1. Go to https://vercel.com/new
2. Click **Import Git Repository**
3. Find and select `mony` repo
4. Click **Import**

### Step 2: Configure Frontend

**In Vercel Dashboard**:
1. Go to your project Settings
2. **Environment Variables** → Add:
   - **Key**: `NEXT_PUBLIC_API_URL`
   - **Value**: `https://mony-api.onrender.com` (placeholder, update after Render setup)
   - Click **Save**

3. Go to **Deployments** tab
4. Click **Redeploy** on the latest deployment
5. Wait for build to complete (~3 minutes)

### Verify ✅

```bash
# Check deployment logs
vercel logs

# Visit your site
# https://mony-web.vercel.app (or custom domain)
# Should see "Mony" heading
```

---

## ✅ Part 3: Render Deployment (Backend + Database) (20 min)

### Step 1: Create PostgreSQL Database

1. Go to https://dashboard.render.com
2. Click **New +** → **PostgreSQL**
3. Configure:
   - **Name**: `mony-db`
   - **Database**: `mony_dev`
   - **User**: `mony_user`
   - **Region**: US East (or closest to you)
   - **Plan**: Free (or Starter $7/mo for production)
4. Click **Create Database**
5. **Wait for "Available" status** (~2 minutes)
6. **Copy the Internal Database URL**
   - Format: `postgresql://mony_user:PASSWORD@HOST:5432/mony_dev`
   - Save this for next step

### Step 2: Create Backend Web Service

1. **Still in Render**, click **New +** → **Web Service**
2. **Connect GitHub** (authorize Render)
3. Find and select `mony` repository
4. Click **Connect**

### Step 3: Configure Backend Service

Fill in the form:

```
Name: mony-api
Environment: Python 3
Region: Same as database (US East)
Branch: main
Root Directory: apps/api

Build Command:
  pip install -r requirements.txt

Start Command:
  python -m uvicorn main:app --host 0.0.0.0 --port $PORT

Plan: Free (or Starter for production)
```

### Step 4: Add Environment Variables

Before clicking "Create Web Service", add environment variables:

1. Click **Advanced** → **Environment**
2. Add these variables:

```
DATABASE_URL = postgresql://mony_user:PASSWORD@hostname:5432/mony_dev
JWT_SECRET = (generate with: openssl rand -hex 32)
ENVIRONMENT = production
```

**To generate JWT_SECRET**:
```bash
openssl rand -hex 32
# Copy output and paste in JWT_SECRET field
```

3. Click **Create Web Service**
4. **Wait for "Live" status** (~5 minutes)

### Verify ✅

```bash
# Check health endpoint
curl https://mony-api.onrender.com/health
# Should return: {"status":"healthy"}

# Check API docs
# Visit: https://mony-api.onrender.com/docs
# Should see Swagger UI
```

---

## ✅ Part 4: Update Frontend Environment Variable

Now that you have the real Render URL:

1. Go back to **Vercel Dashboard**
2. Go to your project → **Settings** → **Environment Variables**
3. Edit `NEXT_PUBLIC_API_URL`
   - **Old Value**: `https://mony-api.onrender.com` (placeholder)
   - **New Value**: `https://your-actual-render-url` (from Step 1)
4. Click **Save**
5. Click **Deployments** → **Redeploy** latest
6. Wait for build to complete

### Verify ✅

```bash
# Test API connection from frontend
# Visit: https://mony-web.vercel.app/health
# OR make a request: curl https://mony-api.onrender.com/health
```

---

## ✅ Part 5: Configure Render PostgreSQL (Critical!)

The database needs initial setup:

### Option A: Via Render Dashboard

1. Go to your PostgreSQL instance on Render
2. Click **Shell** tab
3. Run:

```sql
-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create initial tables (will be replaced by migrations)
-- For now, just verify database exists
SELECT version();
```

### Option B: Via Local Connection (if accessible)

```bash
# Using psql locally (if you have it)
PGPASSWORD="PASSWORD" psql -h hostname -U mony_user -d mony_dev -c "SELECT version();"
```

---

## ✅ Part 6: Verify Full Stack

### Health Check Sequence

```bash
# 1. Check backend health
curl https://mony-api.onrender.com/health
# Expected: {"status":"healthy"}

# 2. Check API docs
curl https://mony-api.onrender.com/docs
# Should return HTML

# 3. Check frontend loads
curl https://mony-web.vercel.app
# Should return HTML with "Mony" heading

# 4. Check GitHub Actions CI runs
# Visit: https://github.com/YOUR_USERNAME/mony/actions
# Should see CI workflow running
```

---

## 🎯 Final Checklist

### GitHub ✅
- [ ] Repository created (`mony`)
- [ ] Code pushed to main branch
- [ ] All 9 commits visible

### Vercel (Frontend) ✅
- [ ] Project linked
- [ ] Environment variables set
- [ ] Deployed successfully
- [ ] URL accessible: `https://mony-web.vercel.app`

### Render (Backend) ✅
- [ ] PostgreSQL database created
- [ ] Web service created
- [ ] Environment variables set
- [ ] Deployed & showing "Live"
- [ ] URL accessible: `https://mony-api.onrender.com`
- [ ] Health check returns `{"status":"healthy"}`

### CI/CD ✅
- [ ] GitHub Actions workflow running
- [ ] Lint checks passing
- [ ] Build checks passing
- [ ] Auto-deploy on push working

### Integration ✅
- [ ] Frontend can reach backend (CORS working)
- [ ] Database accessible from backend
- [ ] API docs visible at `/docs`

---

## 📋 URLs to Save

```
Frontend (Vercel):    https://mony-web.vercel.app
Backend (Render):     https://mony-api.onrender.com
API Docs:             https://mony-api.onrender.com/docs
GitHub:               https://github.com/YOUR_USERNAME/mony
Vercel Dashboard:     https://vercel.com/dashboard
Render Dashboard:     https://dashboard.render.com
```

---

## 🆘 Troubleshooting

### Vercel Build Fails

**Check build logs**:
```bash
vercel logs --follow
```

Common issues:
- Missing environment variable
- Node version mismatch (should use 18+)
- Dependencies not installed

**Fix**: Update `.env.example` and redeploy

---

### Render Build Fails

**Check service logs**: Render Dashboard → Service → Logs

Common issues:
- Python version (should use 3.11+)
- Missing `requirements.txt`
- DATABASE_URL not set

**Fix**: Update requirements.txt and redeploy

---

### API Returns 502 Gateway Error

**Check**:
1. Is Render service "Live"? (not "Building")
2. Check logs for startup errors
3. Verify DATABASE_URL is correct
4. Ensure uvicorn start command is correct

---

### Frontend Can't Connect to Backend

**Check**:
1. `NEXT_PUBLIC_API_URL` set in Vercel
2. Render API is running (`/health` works)
3. CORS is enabled (should be by default in FastAPI)
4. No firewall blocking cross-origin requests

---

## 🎉 You're Live!

Once all checks pass:

✅ **Mony is deployed to production**  
✅ **CI/CD pipeline is active**  
✅ **Ready for Story 1.2 implementation**

---

## Next: Story 1.2 Backend Implementation

Once deployed, @dev can start implementing:

1. `apps/api/core/security.py` - Password & JWT utils
2. `apps/api/api/auth/router.py` - 6 auth endpoints
3. `apps/api/api/users/router.py` - 4 user endpoints
4. `apps/api/api/subscriptions/router.py` - 4 plan endpoints

**Estimated**: 15 hours

---

**Total Deploy Time**: 45 minutes  
**Status**: 🟢 Ready to Go!

Generated: 2026-04-15

# 🚀 Mony Deployment Checklist

Complete este checklist para colocar Mony em produção.

---

## ✅ Phase 1: GitHub Setup (15 min)

### Create Repository
- [ ] Create GitHub repo at https://github.com/new
  - Name: `mony`
  - Visibility: Public
  - Do NOT initialize

- [ ] Push local code to GitHub:
  ```bash
  cd c:\Users\cristofer.schwartzer\mony
  git remote add origin https://github.com/YOUR_USERNAME/mony.git
  git branch -M main
  git push -u origin main
  ```

- [ ] Verify on GitHub: https://github.com/YOUR_USERNAME/mony
  - [ ] See 3 commits
  - [ ] See all files

### Branch Protection (Optional but Recommended)
- [ ] Go to Settings → Branches
- [ ] Add branch protection rule for `main`
- [ ] Enable: Require status checks
- [ ] Enable: Require PR reviews (1 minimum)

---

## ✅ Phase 2: Vercel Setup (Frontend) (15 min)

### Create Vercel Project
- [ ] Go to https://vercel.com/new
- [ ] **Import Git Repository** → Select your GitHub account
- [ ] Find and select `mony` repo
- [ ] **Framework Preset**: Next.js (auto-detected)
- [ ] **Root Directory**: `apps/web`
- [ ] Click Import Project

### Vercel Environment Variables
- [ ] After import, go to Settings → Environment Variables
- [ ] **Key**: `NEXT_PUBLIC_API_URL`
- [ ] **Value**: `https://mony-api.onrender.com` (use this placeholder for now)
- [ ] Save variable
- [ ] Click "Redeploy" to apply

### First Deployment
- [ ] Vercel auto-deploys main branch
- [ ] Wait for "Ready" status
- [ ] Visit https://mony-web.vercel.app (or your custom domain)
- [ ] You should see "Mony" heading

---

## ✅ Phase 3: Render Setup (Backend) (20 min)

### Create PostgreSQL Database First
1. [ ] Go to https://dashboard.render.com
2. [ ] Click **New +** → **PostgreSQL**
3. [ ] **Name**: `mony-db`
4. [ ] **Database**: `mony_dev`
5. [ ] **User**: `mony_user`
6. [ ] **Region**: Choose closest to you (US East, EU West, etc.)
7. [ ] **Plan**: Free (for dev) or Starter ($7/mo for production)
8. [ ] Click **Create Database**

### Get Database Connection String
- [ ] Wait for database to be "Available"
- [ ] Copy **Internal Database URL** (for API)
- [ ] Format: `postgresql://username:password@hostname:5432/dbname`

### Create Backend Service
1. [ ] Go to https://dashboard.render.com
2. [ ] Click **New +** → **Web Service**
3. [ ] **Connect GitHub**: Authorize Render
4. [ ] Search for and select `mony` repository
5. [ ] Click **Connect**

### Configure Backend Service
- [ ] **Name**: `mony-api`
- [ ] **Environment**: Python 3
- [ ] **Build Command**: `pip install -r requirements.txt`
- [ ] **Start Command**: `python -m uvicorn main:app --host 0.0.0.0 --port $PORT`
- [ ] **Region**: Same as database (for speed)
- [ ] **Plan**: Free (for dev) or Starter ($7/mo)

### Add Environment Variables
- [ ] In Service Settings → Environment:
  - [ ] **DATABASE_URL** = (paste PostgreSQL URL from above)
  - [ ] **JWT_SECRET** = Generate with: `openssl rand -hex 32`
  - [ ] **ENVIRONMENT** = `production`

### Deploy
- [ ] Click **Create Web Service**
- [ ] Wait for "Live" status
- [ ] Visit https://mony-api.onrender.com/health
- [ ] You should see `{"status":"healthy"}`

---

## ✅ Phase 4: Update Frontend Environment Variable (5 min)

### Update Vercel with Real Render URL
- [ ] Get your Render API URL: `https://mony-api.onrender.com`
- [ ] Go to Vercel → Settings → Environment Variables
- [ ] Update `NEXT_PUBLIC_API_URL` with real Render URL
- [ ] Click "Redeploy"
- [ ] Wait for deployment to complete

---

## ✅ Phase 5: Verify Everything (10 min)

### Health Checks
- [ ] Frontend loads: https://mony-web.vercel.app
- [ ] Backend health: https://mony-api.onrender.com/health
- [ ] API docs: https://mony-api.onrender.com/docs

### API Testing
- [ ] Open https://mony-api.onrender.com/docs (Swagger UI)
- [ ] Click "Try it out" on `/health` endpoint
- [ ] Should see: `{"status": "healthy"}`

### CI/CD Verification
- [ ] Go to your GitHub repo
- [ ] Click **Actions** tab
- [ ] See CI workflow running
- [ ] Should pass all checks (lint, test, build)

---

## ✅ Phase 6: Team & Permissions (10 min)

### GitHub
- [ ] Go to Settings → Collaborators & teams
- [ ] Add team members with appropriate permissions

### Vercel
- [ ] Go to Settings → Invite
- [ ] Add team members

### Render
- [ ] Go to Account Settings → Team Invite
- [ ] Add team members

---

## 🎉 Final Verification

All checks should pass:

- [ ] GitHub repo created and code pushed
- [ ] Vercel project created and deployed
- [ ] Render API service deployed and healthy
- [ ] Render PostgreSQL database created
- [ ] Environment variables set on both platforms
- [ ] Frontend accessible at public URL
- [ ] Backend API accessible at public URL
- [ ] API health check returning 200
- [ ] CI/CD pipeline running on push

---

## 📞 Troubleshooting

### Vercel Build Fails
```
Issue: Build failed
Solution: 
1. Check Vercel build logs
2. Verify apps/web/package.json exists
3. Check for build errors in output
4. Run `npm run build` locally first
```

### Render Deployment Fails
```
Issue: Service failed to start
Solution:
1. Check Render logs: Dashboard → your-service → Logs
2. Verify DATABASE_URL is correct
3. Check that apps/api/main.py exists
4. Run `python main.py` locally to test
```

### API Returns 502 Gateway Error
```
Issue: Bad Gateway
Solution:
1. Check Render service is "Live" (not "Build in progress")
2. Check logs for startup errors
3. Verify Start Command is correct
4. Check environment variables are set
```

### Frontend Can't Reach Backend
```
Issue: CORS errors or connection refused
Solution:
1. Check NEXT_PUBLIC_API_URL in Vercel env vars
2. Verify it points to correct Render URL
3. Check backend is running (health check)
4. Clear browser cache, hard refresh (Ctrl+Shift+R)
```

---

## 🚀 You're Live!

Once all checks pass, Mony is deployed! 

**Next Steps**:
1. Story 1.1: Design database schema (@architect, @data-engineer)
2. Story 1.2: Implement authentication
3. Continue with Story 1.3 - 1.7

---

**Status**: 🟡 IN PROGRESS - Complete each phase in order

*Created: 2026-04-15*
*Last Updated: 2026-04-15*

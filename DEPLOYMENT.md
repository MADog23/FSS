# Deployment Guide — Financial Safety Forecasting System

This guide takes you from your local machine to a live app on the internet
using **Railway** (backend + database) and **Vercel** (frontend). Both have
free tiers that are more than enough for beta testing.

---

## Prerequisites

- A **GitHub** account (both Railway and Vercel deploy from Git)
- A **Railway** account — sign up at https://railway.app (free)
- A **Vercel** account — sign up at https://vercel.com (free)

---

## Step 1 — Push the project to GitHub

Railway and Vercel both deploy from a Git repository. If you haven't done
this before, here's the quickest way:

1. Go to https://github.com/new and create a new **private** repository
   called `financial-safety`. Leave it empty (no README).

2. Open a terminal in your project folder and run:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/financial-safety.git
git push -u origin main
```

Whenever you apply a future update, just run:
```bash
git add .
git commit -m "v1.x update"
git push
```
Railway and Vercel will automatically redeploy.

---

## Step 2 — Deploy the backend on Railway

### 2a. Create a new Railway project

1. Go to https://railway.app and sign in
2. Click **New Project**
3. Choose **Deploy from GitHub repo**
4. Select your `financial-safety` repository
5. Railway will detect `railway.json` and configure itself automatically

### 2b. Add a PostgreSQL database

1. In your Railway project, click **+ New** → **Database** → **Add PostgreSQL**
2. Railway creates a Postgres instance and adds a `DATABASE_URL` variable
   to your project automatically — you don't need to copy it anywhere,
   Railway injects it into your backend at runtime

### 2c. Set environment variables

In Railway, go to your backend service → **Variables** tab → add these:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | A long random string — use the one generated below |
| `CORS_ORIGIN` | Leave blank for now — you'll fill this in after Step 3 |
| `PORT` | Leave blank — Railway sets this automatically |

**Generating a JWT_SECRET:**
Run this in any terminal and copy the output:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Or use any random string generator — 40+ characters, no spaces.

### 2d. Run the database migration

1. In Railway, go to your PostgreSQL service → **Connect** tab
2. Click **Query** (the built-in SQL editor)
3. Open `backend/src/db/schema.sql` from your project folder
4. Paste the entire contents into the Railway query editor
5. Click **Run Query** — you should see success messages for each table

### 2e. Get your backend URL

1. In Railway, go to your backend service → **Settings** → **Domains**
2. Click **Generate Domain** — Railway gives you a URL like:
   `https://financial-safety-production.up.railway.app`
3. Copy this URL — you need it for Steps 3 and 2f

### 2f. Test the backend is live

Open a browser and visit:
```
https://YOUR_RAILWAY_URL/health
```
You should see: `{"ok":true}`

---

## Step 3 — Deploy the frontend on Vercel

### 3a. Import the project

1. Go to https://vercel.com and sign in
2. Click **Add New** → **Project**
3. Import your `financial-safety` GitHub repository
4. Vercel will detect `vercel.json` automatically

### 3b. Set the environment variable

In the Vercel project setup (or later under Settings → Environment Variables),
add:

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your Railway backend URL from Step 2e, e.g. `https://financial-safety-production.up.railway.app` |

**Important:** make sure there is no trailing slash on the URL.

### 3c. Deploy

Click **Deploy**. Vercel builds the frontend and gives you a URL like:
`https://financial-safety-abc123.vercel.app`

### 3d. Set a custom domain (optional)

Under Vercel → Project → Settings → Domains, you can add your own domain
if you have one. Vercel handles the SSL certificate automatically.

---

## Step 4 — Wire the two services together

Now that both are live, tell the backend which frontend URL is allowed:

1. Go back to Railway → your backend service → **Variables**
2. Set `CORS_ORIGIN` to your Vercel frontend URL, e.g.:
   `https://financial-safety-abc123.vercel.app`
3. If you add a custom domain later, add it as a comma-separated second value:
   `https://financial-safety-abc123.vercel.app,https://www.yourdomain.com`
4. Railway redeploys the backend automatically when you save

---

## Step 5 — End-to-end test

1. Open your Vercel URL in a browser
2. Register a new household
3. Add an account, income, and a bill
4. Confirm the dashboard shows a forecast
5. Open the same URL on your phone — it should work identically

---

## Sharing with beta testers

Send beta users your Vercel URL. Each household registers independently —
there's no invite-only gate, just the registration form. If you want to
limit who can register during beta, let me know and I can add a simple
**invite code** to the registration flow.

---

## Future updates

When you receive a new version zip:

1. Run `update.bat` as normal to extract the files locally
2. Run any migration if the release notes mention one (pgAdmin → Railway's
   SQL editor for the production database)
3. Then push to GitHub:
   ```bash
   git add .
   git commit -m "v1.x update"
   git push
   ```
   Railway and Vercel both redeploy automatically within ~2 minutes.

---

## Troubleshooting

**Frontend loads but API calls fail (network error or CORS error)**
- Check `VITE_API_URL` in Vercel — must match your Railway URL exactly, no trailing slash
- Check `CORS_ORIGIN` in Railway — must match your Vercel URL exactly
- After changing either, trigger a redeploy (Railway does it automatically on save; Vercel needs a new push or manual redeploy)

**Railway shows build errors**
- Make sure `railway.json` is in the root of the repository
- Check that `backend/package.json` exists and has a `start` script

**Database connection errors**
- Railway injects `DATABASE_URL` automatically — do not set it manually
- Confirm the migration ran successfully in the Railway SQL editor

**JWT errors / users can't log in after a redeploy**
- Make sure `JWT_SECRET` is set in Railway and hasn't changed — changing it invalidates all existing sessions

**Health check failing**
- Visit `https://YOUR_RAILWAY_URL/health` directly
- If it times out, the backend hasn't finished starting — wait 30 seconds and try again
- If it returns an error, check Railway's deployment logs for the specific error

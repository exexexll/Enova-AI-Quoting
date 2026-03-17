# Step-by-Step: DigitalOcean + Vercel Setup

This guide walks you through deploying **Enova** with the backend on **DigitalOcean** and the client + admin frontends on **Vercel**. Both frontends will use the same backend URL so the admin and client portals stay connected.

**Repository:** `https://github.com/exexexll/Enova-AI-Quoting.git`

---

## Part 0: Push Your Code to GitHub (if not done yet)

If your code is only on your machine, push it to the GitHub repo first.

### Option A: New repo (first time)

```bash
cd /path/to/Enova
git init
git add .
git commit -m "Initial commit: Enova AI Quoting System"
git branch -M main
git remote add origin https://github.com/exexexll/Enova-AI-Quoting.git
git push -u origin main
```

### Option B: Existing local repo

```bash
cd /path/to/Enova
git remote add origin https://github.com/exexexll/Enova-AI-Quoting.git
git branch -M main
git push -u origin main
```

Use a **Personal Access Token** or **SSH** if GitHub asks for authentication.

---

## Part 1: DigitalOcean – Backend (App Platform)

### Step 1.1: Sign in and create an app

1. Go to [digitalocean.com](https://www.digitalocean.com) and sign in.
2. Click **Apps** in the left sidebar, then **Create App**.

### Step 1.2: Connect GitHub

1. Under **Source**, choose **GitHub**.
2. Authorize DigitalOcean if prompted.
3. Select the **exexexll/Enova-AI-Quoting** repository.
4. Branch: **main** (or your default branch).
5. Click **Next**.

### Step 1.3: Configure the backend component

1. DigitalOcean may auto-detect a component. If it adds a “Static Site” or wrong type, remove it and add a **Service** (or edit the existing one to be a service).
2. Set the component to use the **Dockerfile**:
   - **Source**: same repo and branch.
   - **Type**: **Dockerfile**.
   - **Dockerfile path**: `Dockerfile` (repo root).
   - **Docker context**: repo root (leave default).

   If Dockerfile isn’t an option, use **Buildpack** and set:
   - **Run Command**:  
     `gunicorn backend.main:app -w 2 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8080 --timeout 120`
   - **Build Command**:  
     `pip install -r backend/requirements.txt`
   - You may need to set the **working directory** or **start command** so the app runs from the repo root. Prefer using the **Dockerfile** if available.

3. **HTTP Port**: Set to **8000** (or **8080** if the platform expects 8080; adjust the run command above to match).

### Step 1.4: Environment variables

In the same component, open **Environment Variables** and add:

| Name | Value | Encrypt? |
|------|--------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key | Yes |
| `SERPAPI_KEY` | (Optional) SerpAPI key for image search | Yes (if used) |
| `DATA_DIR` | `/data` (if you add a volume; see Step 1.5) | No |
| `CORS_ORIGINS` | Leave empty for now (or set after you have Vercel URLs) | No |

Save.

### Step 1.5: Persistent storage (recommended)

1. In the app spec, add a **Volume** to the backend component.
2. Mount path: **/data**.
3. In **Environment Variables**, set **DATA_DIR** = **/data** so SQLite DB, uploads, and exports persist across deploys.

### Step 1.6: Deploy

1. Click **Next** through any remaining screens (e.g. plan selection).
2. Click **Create Resources** (or **Deploy**).
3. Wait for the build and deploy to finish.
4. Open your app URL, e.g. `https://your-app-xxxxx.ondigitalocean.app`.

### Step 1.7: Get your backend URL

- Your backend base URL is the app URL (no path), e.g.  
  `https://your-app-xxxxx.ondigitalocean.app`
- **No trailing slash.**
- Test: open `https://your-app-xxxxx.ondigitalocean.app/api/health` — you should see `{"status":"ok", ...}`.
- API docs: `https://your-app-xxxxx.ondigitalocean.app/docs`

**Write this URL down** — you’ll use it as `VITE_API_URL` in Vercel.

### Step 1.8: CORS (after Vercel is set up)

Once you have your Vercel URLs (e.g. `https://enova-client.vercel.app` and `https://enova-admin.vercel.app`):

1. In DigitalOcean, open your app → **Settings** → **App-Level Environment Variables** (or the backend component’s env vars).
2. Set **CORS_ORIGINS** to your comma-separated frontend origins, e.g.:  
   `https://enova-client.vercel.app,https://enova-admin.vercel.app`
3. Redeploy if needed.

---

## Part 2: Vercel – Client Frontend

### Step 2.1: Sign in and import project

1. Go to [vercel.com](https://vercel.com) and sign in (e.g. with GitHub).
2. Click **Add New…** → **Project**.
3. **Import** the **exexexll/Enova-AI-Quoting** repository (or select it from the list).
4. Click **Import**.

### Step 2.2: Configure the client app

1. **Project Name**: e.g. `enova-client` (or any name).
2. **Root Directory**: Click **Edit** and set to **`frontend`**.
   - This tells Vercel to build only the client app.
3. **Framework Preset**: Vite (should be auto-detected).
4. **Build Command**: `npm run build` (default).
5. **Output Directory**: `dist` (default for Vite).
6. **Install Command**: `npm install` (default).

### Step 2.3: Environment variable for API URL

1. Expand **Environment Variables**.
2. Add:
   - **Name**: `VITE_API_URL`
   - **Value**: Your DigitalOcean backend URL from Part 1 (e.g. `https://your-app-xxxxx.ondigitalocean.app`) — **no trailing slash**.
   - **Environments**: Production, Preview, Development (or at least Production).
3. Click **Deploy**.

### Step 2.4: Wait and test

1. Wait for the build to finish.
2. Open the deployment URL (e.g. `https://enova-client-xxx.vercel.app`).
3. Create a session and send a message to confirm the client talks to the backend.

---

## Part 3: Vercel – Admin Frontend

### Step 3.1: Second project (same repo)

1. In Vercel dashboard, click **Add New…** → **Project** again.
2. Select the **same** repo: **exexexll/Enova-AI-Quoting**.
3. Click **Import**.

### Step 3.2: Configure the admin app

1. **Project Name**: e.g. `enova-admin`.
2. **Root Directory**: Click **Edit** and set to **`admin`**.
3. **Framework Preset**: Vite.
4. **Build Command**: `npm run build`.
5. **Output Directory**: `dist`.

### Step 3.3: Same API URL

1. Add the **same** environment variable:
   - **Name**: `VITE_API_URL`
   - **Value**: Same DigitalOcean backend URL as the client (no trailing slash).
   - **Environments**: Production (and optionally Preview/Development).
2. Click **Deploy**.

### Step 3.4: Test admin

1. Open the admin deployment URL.
2. Check Dashboard, Sessions, and other pages — they should show the same data as the backend (and client) because both use the same `VITE_API_URL`.

---

## Part 4: Connect Admin and Client (Summary)

- **One backend** on DigitalOcean.
- **Two Vercel projects** (client + admin), both with **the same** `VITE_API_URL` pointing to that backend.
- No extra “linking” step: same API = same data. Sessions, contracts, and escalations created in the client show up in the admin.

---

## Part 5: Optional – Custom Domains

### DigitalOcean (backend)

- In the App → **Settings** → **Domains**, add a custom domain and follow the DNS instructions.

### Vercel (client and admin)

- In each project → **Settings** → **Domains**, add your domain and configure DNS as Vercel instructs.

After adding domains, update **CORS_ORIGINS** on the backend to include the new client and admin URLs.

---

## Troubleshooting

| Issue | What to do |
|-------|------------|
| Backend build fails (Dockerfile) | The Dockerfile copies `Ingredient Master(条包模板） 2.xlsx` from the repo root. Either add that file to the repo, or remove that `COPY` line from the Dockerfile and set the env var `INGREDIENT_MASTER_PATH` in DigitalOcean to a path where the file is available (e.g. on a volume). |
| 404 on API routes | Confirm the backend URL has no trailing slash and that `VITE_API_URL` matches exactly (no typo). |
| CORS errors in browser | Set `CORS_ORIGINS` on DigitalOcean to your Vercel (and custom) origins, comma-separated, then redeploy. |
| Client/Admin show “failed to fetch” | Check backend URL, CORS, and that the backend is running and `/api/health` returns 200. |
| SPA routes 404 on refresh | The repo includes `vercel.json` with rewrites in `frontend/` and `admin/`; Vercel should serve `index.html` for all routes. If not, add the rewrites in the project’s Vercel settings. |

---

## Quick reference

| Item | Value |
|------|--------|
| Repo | `https://github.com/exexexll/Enova-AI-Quoting.git` |
| Backend (DO) | App Platform, Dockerfile at root, port 8000, env: `OPENAI_API_KEY`, `SERPAPI_KEY`, `DATA_DIR`, `CORS_ORIGINS` |
| Client (Vercel) | Root: `frontend`, env: `VITE_API_URL` = backend URL |
| Admin (Vercel) | Root: `admin`, env: `VITE_API_URL` = same backend URL |

For more detail on env vars and architecture, see **DEPLOYMENT.md** and **.env.example** in the repo.

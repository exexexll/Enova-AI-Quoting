# Enova Science – AI-Powered Supplement Quoting

Enova is an AI quoting system for supplement formulation and pricing. It includes a **client portal** (chat, sessions, ingredients, contracts) and an **admin portal** (dashboard, sessions, escalation queue, DB import, config). Both connect to the same **FastAPI backend**.

---

## Repository structure

```
Enova/
├── backend/          # FastAPI app (Python)
├── frontend/         # Client portal (React + Vite)
├── admin/            # Admin portal (React + Vite)
├── docs/             # Deployment and other docs
├── .env.example      # Env var template (copy to .env)
├── Dockerfile        # Backend image for deployment
├── start.sh          # Start backend + frontend + admin locally
├── README.md         # This file
└── STATUS_REPORT.md  # Project status and feature checklist
```

---

## Prerequisites

- **Python 3.11+** (3.12 recommended; backend)
- **Node.js 18+** and **npm** (frontend & admin)
- **Optional:** OpenAI API key and SerpAPI key (see Backend setup)

---

## Step-by-step setup

### 1. Clone or open the project

**If cloning from GitHub:**

```bash
git clone https://github.com/exexexll/Enova-AI-Quoting.git
cd Enova-AI-Quoting
```

**If you already have the code locally**, just `cd` into the project folder.

---

### 2. Backend setup

#### 2.1 Create and activate a virtual environment

```bash
# From repo root (Enova/)
python3 -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate
```

#### 2.2 Install Python dependencies

```bash
pip install -r backend/requirements.txt
```

#### 2.3 (Optional) Environment variables

Copy the example env file and edit if you need API keys or path overrides:

```bash
cp .env.example .env
# Edit .env and set OPENAI_API_KEY and optionally SERPAPI_KEY
```

For local dev you can skip `.env`; the app will run but AI chat and image search will need keys to work fully.

#### 2.4 Run the backend

From the **repo root** (so that `backend` is a package):

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

- API: **http://localhost:8000**
- API docs: **http://localhost:8000/docs**
- Health: **http://localhost:8000/api/health**

Leave this terminal running. For development with auto-reload:

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

---

### 3. Frontend (client portal) setup

#### 3.1 Install dependencies

```bash
cd frontend
npm install
```

#### 3.2 Run the client app

```bash
npm run dev
```

- App: **http://localhost:3000**
- Vite proxies `/api` to `http://localhost:8000`, so no extra env is needed for local dev.

To point at a different backend (e.g. production), create a `.env` in `frontend/`:

```bash
# frontend/.env
VITE_API_URL=http://localhost:8000
```

Then restart `npm run dev`. For production builds, set `VITE_API_URL` in your build environment (e.g. Vercel).

---

### 4. Admin portal setup

#### 4.1 Install dependencies

```bash
cd admin
npm install
```

#### 4.2 Run the admin app

From the **admin** directory:

```bash
npm run dev
```

If the default port is in use, run on port 3001:

```bash
npm run dev -- --port 3001
```

- Admin: **http://localhost:3001** (or the port Vite shows)
- Vite proxies `/api` to `http://localhost:8000` by default.

To use a different backend, create `admin/.env`:

```bash
# admin/.env
VITE_API_URL=http://localhost:8000
```

---

### 5. Run everything at once (optional)

From repo root, with backend venv activated:

```bash
chmod +x start.sh
./start.sh
```

This starts:

- Backend on **8000**
- Client on **3000**
- Admin on **3001**

Stop with `Ctrl+C`.

---

## Environment variables reference

| Variable | Used by | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | Backend | Required for AI chat and tools |
| `SERPAPI_KEY` | Backend | Optional; ingredient image search |
| `DATA_DIR` | Backend | Override for data directory |
| `CORS_ORIGINS` | Backend | Allowed origins (comma-separated); default `*` |
| `VITE_API_URL` | Frontend & Admin | Backend base URL (e.g. `https://api.example.com`) |

See `.env.example` for the full list.

---

## Build for production

- **Backend:** Use the included `Dockerfile` (see `docs/DEPLOYMENT.md`) or run gunicorn with uvicorn workers.
- **Client:** `cd frontend && npm run build` → output in `frontend/dist`.
- **Admin:** `cd admin && npm run build` → output in `admin/dist`.

Set `VITE_API_URL` to your backend URL when building or in your hosting platform (e.g. Vercel).

---

## Deployment

- **Backend:** DigitalOcean (App Platform or Droplet), using the repo Dockerfile and env vars.
- **Frontends:** Vercel; set **the same** `VITE_API_URL` for both client and admin so they stay connected to one backend.

**Step-by-step guides:**

- **docs/SETUP_DIGITALOCEAN_VERCEL.md** – Full walkthrough: push to GitHub, deploy backend on DigitalOcean, deploy client and admin on Vercel, connect both frontends to the same backend.
- **docs/DEPLOYMENT.md** – Architecture and reference (env vars, CORS, post-deploy checks).

---

## Push to GitHub

If your code is only on your machine and you use the repo `https://github.com/exexexll/Enova-AI-Quoting`:

**First time (new repo):**

```bash
git init
git add .
git commit -m "Initial commit: Enova AI Quoting System"
git branch -M main
git remote add origin https://github.com/exexexll/Enova-AI-Quoting.git
git push -u origin main
```

**Existing repo:**

```bash
git remote add origin https://github.com/exexexll/Enova-AI-Quoting.git
git branch -M main
git push -u origin main
```

Use a GitHub Personal Access Token or SSH if prompted for authentication.

---

## Status and docs

- **STATUS_REPORT.md** – Feature checklist, architecture, and deployment readiness.
- **docs/SETUP_DIGITALOCEAN_VERCEL.md** – Step-by-step DigitalOcean + Vercel setup.
- **docs/DEPLOYMENT.md** – Architecture and deployment reference.

# Enova AI Quoting System – Deployment Guide

This document describes how to deploy the app with **DigitalOcean** (backend), **Vercel** (client + admin frontends), and a shared backend so the **admin portal and client portal stay connected** (same API, same data).

**For a full step-by-step walkthrough** (GitHub → DigitalOcean → Vercel), see **SETUP_DIGITALOCEAN_VERCEL.md** in this folder.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Vercel                                                          │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │  Client Portal      │    │  Admin Portal        │            │
│  │  (frontend/)        │    │  (admin/)            │            │
│  │  VITE_API_URL ──────┼────┼──► same backend URL  │            │
│  └──────────┬──────────┘    └──────────┬──────────┘            │
└─────────────┼──────────────────────────┼────────────────────────┘
              │                          │
              ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  DigitalOcean                                                     │
│  ┌─────────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  FastAPI Backend     │  │  PostgreSQL  │  │  Persistent     │ │
│  │  (App Platform or   │  │  (Managed DB)│  │  Volume (data/)  │ │
│  │   Droplet)           │  │              │  │                  │ │
│  └─────────────────────┘  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

- **Client portal** and **admin portal** both call the **same backend URL** via `VITE_API_URL`. No extra “linking” step: set the same env in both Vercel projects.
- Backend uses one **database** and one **data directory** (uploads, contracts, exports).

---

## 1. Environment variables

### Backend (DigitalOcean)

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key (no default in production). |
| `SERPAPI_KEY` | No | SerpAPI key for ingredient images; optional. |
| `DATA_DIR` | No | Override for `data/` path (e.g. mounted volume). |
| `INGREDIENT_MASTER_PATH` | No | Path to Ingredient Master Excel; default is in repo. |
| `DATABASE_URL` | Later | For PostgreSQL migration; not used with SQLite. |

Local dev can still use a `.env` file or system env; production should set these in the DigitalOcean app/droplet.

### Frontends (Vercel) – **same for client and admin**

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes (prod) | Backend base URL, e.g. `https://your-app-xxxxx.ondigitalocean.app` (no trailing slash). |

Set **the same** `VITE_API_URL` in both the **client** and **admin** Vercel projects so both talk to the same backend and stay connected.

---

## 2. Backend on DigitalOcean

### Option A: App Platform

1. Create a new App, connect the repo.
2. Set **Source**: Dockerfile (if you add one) or build/run commands for Python.
3. **Build**: e.g. `pip install -r backend/requirements.txt`.
4. **Run**: e.g. `uvicorn backend.main:app --host 0.0.0.0 --port 8000` (or gunicorn with uvicorn workers).
5. Add **env vars**: `OPENAI_API_KEY`, `SERPAPI_KEY`, optional `DATA_DIR`.
6. Attach a **Volume** and set `DATA_DIR` to the mount path so `data/` (client_uploads, contracts, exports, etc.) persists.
7. Note the public URL (e.g. `https://your-app-xxxxx.ondigitalocean.app`) — this is your **API base URL**.

### Option B: Droplet

- Run the backend in Docker or directly with Python; mount a volume for `data/`.
- Put env vars in `.env` or the process manager. Use a reverse proxy (e.g. Caddy/nginx) and point DNS to the droplet.

---

## 3. Database (optional PostgreSQL)

- Current default is **SQLite** (`data/enova.db`). For production at scale, use **DigitalOcean Managed PostgreSQL**.
- Create a cluster, get the connection string, set `DATABASE_URL` on the backend.
- Migrate the schema from `backend/models/database.py` to PostgreSQL (replace SQLite-specific types and `datetime('now')` with `NOW()`, etc.) and run migrations. Until then, SQLite + persistent volume works.

---

## 4. Frontends on Vercel (client + admin, connected via same API)

### Client portal (frontend)

1. New Vercel project; connect the same repo.
2. **Root directory**: `frontend`.
3. **Build**: `npm run build`; **Output**: `dist`.
4. **Environment variable**: `VITE_API_URL` = your DigitalOcean backend URL (e.g. `https://your-app-xxxxx.ondigitalocean.app`).
5. Deploy.

### Admin portal (admin)

1. Another Vercel project (or same repo, second project).
2. **Root directory**: `admin`.
3. **Build**: `npm run build`; **Output**: `dist`.
4. **Environment variable**: `VITE_API_URL` = **same** backend URL as above.
5. Deploy.

Because both use the same `VITE_API_URL`, the **admin portal and client portal are connected**: they share the same backend, sessions, contracts, and escalations.

---

## 5. Keeping admin and client connected

- **Single source of truth**: One backend on DigitalOcean.
- **Same env**: Use the same `VITE_API_URL` in both Vercel projects (client and admin).
- **No extra config**: The codebase uses `VITE_API_URL` everywhere (via `frontend/src/config.ts` and `admin/src/config.ts`). No hardcoded backend URLs in production.

After deployment:

- Client: create sessions, chat, upload files, view contracts.
- Admin: dashboard, sessions, request queue (escalations), contracts, pricing config, DB import, ingredient DB — all against the same backend.

---

## 6. Post-deploy checks

1. **Backend**: Open `https://your-backend-url/docs` and confirm FastAPI docs load; optional: hit `/api/sessions` to see empty list or existing data.
2. **CORS**: Backend allows origins `*` by default; restrict to your Vercel domains if desired.
3. **Client app**: Create a session and send a message; confirm it appears in admin “Sessions” and “Request Queue” if applicable.
4. **Admin app**: Open Dashboard, Sessions, Contracts; confirm they show the same data as the backend.

---

## 7. Repo reference

- **Backend**: `backend/` — FastAPI app, config in `backend/config.py` (env-based, no hardcoded secrets).
- **Client**: `frontend/` — uses `VITE_API_URL` via `frontend/src/config.ts`.
- **Admin**: `admin/` — uses `VITE_API_URL` via `admin/src/config.ts`.

See `.env.example` in the repo root for a list of variable names (no real secrets).

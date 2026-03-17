# Enova Science – Project Status Report

**Generated:** March 2025  
**Project:** Enova AI Quoting System (supplement formulation & pricing)

---

## 1. Overview

| Item | Status |
|------|--------|
| **Backend** | FastAPI on Python 3.12+, SQLite (PostgreSQL-ready) |
| **Client frontend** | React 19 + Vite 8 + TypeScript + Tailwind |
| **Admin portal** | React 19 + Vite 8 + TypeScript + Tailwind (optional Electron) |
| **Deployment** | Backend: DigitalOcean (Docker/gunicorn). Frontends: Vercel |
| **Documentation** | README, DEPLOYMENT.md, .env.example |

---

## 2. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (frontend/)          Admin (admin/)                      │
│  Port 3000                   Port 3001                           │
│  VITE_API_URL ──────────────► same backend ◄─────────────────────│
└─────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend (backend/) – FastAPI, port 8000                         │
│  • REST API + SSE chat streaming                                 │
│  • SQLite (data/enova.db)                                        │
│  • data/: exports, client_records, escalation_queue, contracts   │
└─────────────────────────────────────────────────────────────────┘
```

- **Single backend**: Client and admin both use `VITE_API_URL` → same API, same data.
- **Data dir**: Configurable via `DATA_DIR`; defaults to `backend/../data` (or repo root `data/` when run from root).

---

## 3. Feature Checklist

| Area | Feature | Status |
|------|---------|--------|
| **Client** | Landing page (supplement types: capsule, tablet, powder, gummy, liquid, softgel) | ✅ |
| **Client** | Chat with AI (SSE streaming, thinking/executing tags) | ✅ |
| **Client** | Session list & history | ✅ |
| **Client** | Ingredient search & popup (pricing, escalate) | ✅ |
| **Client** | Workflow progress (steps) | ✅ |
| **Backend** | Sessions CRUD, chat streaming | ✅ |
| **Backend** | Multi-agent pipeline (orchestrator, tools: search, pricing, escalation, workflow) | ✅ |
| **Backend** | Pricing engine (ingredients, machine, labor, packaging, transportation) | ✅ |
| **Backend** | Hybrid search (BM25 + optional embeddings), ingredient master import | ✅ |
| **Backend** | Escalation queue, contracts, file uploads | ✅ |
| **Backend** | Health check `/api/health` | ✅ |
| **Admin** | Dashboard, sessions, escalation queue, contracts | ✅ |
| **Admin** | DB import (Excel), rates preview | ✅ |
| **Admin** | Config (pricing defaults) | ✅ |
| **DevOps** | Dockerfile (backend), .env.example, CORS env-driven | ✅ |
| **Docs** | DEPLOYMENT.md (DigitalOcean + Vercel) | ✅ |

---

## 4. Tech Stack

| Layer | Technologies |
|-------|----------------|
| Backend | FastAPI, uvicorn, gunicorn, OpenAI, SerpAPI (optional), openpyxl, reportlab, sse-starlette |
| DB | SQLite (production path: PostgreSQL migration planned) |
| Client/Admin | React 19, Vite 8, TypeScript, Tailwind CSS |
| Deployment | Backend: Docker (Python 3.12), Gunicorn + Uvicorn workers; Frontends: Vercel |

---

## 5. Environment & Configuration

| Variable | Where | Purpose |
|----------|--------|---------|
| `OPENAI_API_KEY` | Backend | Required for AI chat and tools |
| `SERPAPI_KEY` | Backend | Optional; ingredient image search |
| `DATA_DIR` | Backend | Override data directory (e.g. mounted volume) |
| `CORS_ORIGINS` | Backend | Comma-separated origins (default `*` for dev) |
| `VITE_API_URL` | Frontend & Admin | Backend base URL (same for both in production) |

See `.env.example` for the full list.

---

## 6. Code Quality & Recent Fixes

- **Lint/type**: Basedpyright and TypeScript errors addressed (orchestrator tools cast, `wb.active` null check, IngredientPopup types, App.tsx unused var).
- **Accessibility**: Buttons use `aria-label` where applicable.
- **Shuffle**: Fisher–Yates used for random order (e.g. sidebar ingredients); biased `Array.sort` removed.
- **CORS**: Env-driven `CORS_ORIGINS`; no wildcard + credentials conflict.
- **Pricing**: Confidence gating, waste factors, margins; division-by-zero and edge cases handled.

---

## 7. Deployment Readiness

| Item | Status |
|------|--------|
| Backend runs in Docker (gunicorn + uvicorn workers) | ✅ |
| Env-based config (no hardcoded secrets) | ✅ |
| Health endpoint for load balancers | ✅ |
| Client & admin point to same backend via `VITE_API_URL` | ✅ |
| PostgreSQL migration (optional) | Documented; not yet implemented |

---

## 8. Local Run (Quick Reference)

- **Backend:** From repo root, with venv: `python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000`
- **Client:** `cd frontend && npm run dev` (port 3000, proxies `/api` to 8000)
- **Admin:** `cd admin && npm run dev` (port 3001, proxies `/api` to 8000)
- **All at once:** `./start.sh` (if executable)

---

## 9. Known Limitations

- Database is SQLite; for scale, migrate to PostgreSQL (see DEPLOYMENT.md).
- Ingredient Master and MFSO template paths default to repo files; override with env in production if needed.
- Admin can be run as Electron app; `electron/main.ts` may have `@ts-nocheck` and CommonJS requires if used.

---

*For step-by-step setup and deployment, see **README.md** and **docs/DEPLOYMENT.md**.*

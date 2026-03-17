/**
 * API base URL for the backend.
 *
 * Production (Vercel): set VITE_API_URL env var to backend URL.
 * Local dev: falls back to localhost:8000 (Vite proxy handles /api).
 */
export const API_BASE =
  (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";

/**
 * API base URL for the backend.
 *
 * Production (Vercel): set VITE_API_URL env var to override.
 * Local dev: Vite proxy handles /api → localhost:8000 automatically.
 */
const _env = import.meta.env.VITE_API_URL as string | undefined;
export const API_BASE: string =
  _env ||
  (import.meta.env.DEV ? "" : "https://orca-app-ewxva.ondigitalocean.app");

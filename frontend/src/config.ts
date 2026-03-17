/**
 * API base URL for the backend. Set VITE_API_URL in production (e.g. Vercel)
 * so client and admin portals both talk to the same backend.
 */
export const API_BASE =
  (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";

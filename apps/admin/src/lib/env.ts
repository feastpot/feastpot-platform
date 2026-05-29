/**
 * Centralised env access for the admin panel.
 *
 * The API origin resolves in this order:
 *  1. NEXT_PUBLIC_API_URL (set per-project in Vercel).
 *  2. Production fallback to the stable public API origin — so a missing var
 *     never silently points the live panel at `localhost`.
 *  3. Development fallback to the local Nest dev server on port 3001.
 *
 * Always prefer setting NEXT_PUBLIC_API_URL explicitly per environment.
 */
const PRODUCTION_API_URL = 'https://api.feastpot.co.uk';

function resolveApiUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  return process.env.NODE_ENV === 'production' ? PRODUCTION_API_URL : 'http://localhost:3001';
}

export const API_URL = resolveApiUrl();

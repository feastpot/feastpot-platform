/**
 * Centralised API origin resolution for the customer PWA.
 *
 * Resolution order:
 *  1. NEXT_PUBLIC_API_URL (the canonical config — set per-project in Vercel).
 *     Used verbatim, with any trailing slash stripped.
 *  2. Production with the var unset → the stable public API origin. This is a
 *     safety net: it keeps the app working instead of falling through to a
 *     relative `/v1` that Vercel cannot route (the dev proxy in
 *     `next.config.mjs > rewrites()` is gated to non-production on purpose).
 *  3. Development with the var unset:
 *       • Browser: empty string → relative `/v1/...`, which the Next dev
 *         server rewrites to http://localhost:3001 (reachable from inside the
 *         Replit preview iframe / a LAN device).
 *       • Server (RSC, route handlers): http://localhost:3001, because Node
 *         fetch needs an absolute URL.
 *
 * Always prefer setting NEXT_PUBLIC_API_URL explicitly per environment.
 */
const PRODUCTION_API_URL = 'https://api.feastpot.co.uk';

function resolveApiUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') return PRODUCTION_API_URL;
  return typeof window !== 'undefined' ? '' : 'http://localhost:3001';
}

export const API_URL = resolveApiUrl();

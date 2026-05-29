/**
 * Centralised env access for the vendor portal.
 *
 * URLs resolve in this order:
 *  1. The explicit `NEXT_PUBLIC_*` env var (set per-project in Vercel).
 *  2. Production fallback to the stable public origin — so a missing var never
 *     silently points the live portal at `localhost`.
 *  3. Development fallback to the local Next/Nest dev servers.
 *
 * Always prefer setting the env vars explicitly per environment.
 */
const PRODUCTION_API_URL = 'https://api.feastpot.co.uk';
const PRODUCTION_WEB_URL = 'https://feastpot.co.uk';

function resolveUrl(value: string | undefined, prod: string, dev: string): string {
  const explicit = value?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  return process.env.NODE_ENV === 'production' ? prod : dev;
}

/** Backend API origin. */
export const API_URL = resolveUrl(
  process.env.NEXT_PUBLIC_API_URL,
  PRODUCTION_API_URL,
  'http://localhost:3001',
);

/**
 * Public customer storefront base URL. Used for "preview your menu" links
 * (T008) and any other deep links from the vendor portal back to the
 * customer site.
 */
export const WEB_URL = resolveUrl(
  process.env.NEXT_PUBLIC_WEB_URL,
  PRODUCTION_WEB_URL,
  'http://localhost:3000',
);

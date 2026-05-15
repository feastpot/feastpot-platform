/**
 * Centralised env access. Throw early if a required public var is missing
 * — better than a confusing CORS / 404 storm later.
 *
 * Default behaviour when NEXT_PUBLIC_API_URL is unset:
 *  - Browser: empty string → fetches go to `/v1/...` (relative, same-origin).
 *    The Next.js dev server rewrites `/v1/*` to `http://localhost:3001/v1/*`
 *    (see `next.config.mjs > rewrites()`), so the API container is reachable
 *    even when the user's browser cannot resolve `localhost:3001` directly
 *    (e.g. Replit preview iframe, mobile device on LAN).
 *  - Server (RSC, route handlers): falls back to `http://localhost:3001`
 *    because Node-side fetch can't resolve relative URLs and the API does
 *    live on localhost from the Next process's perspective.
 *
 * Production should set NEXT_PUBLIC_API_URL explicitly to the public API
 * origin (e.g. `https://api.feastpot.co.uk`).
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== 'undefined' ? '' : 'http://localhost:3001');

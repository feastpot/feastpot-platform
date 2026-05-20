/**
 * Server-readable mirror of the user's confirmed coverage postcode.
 *
 * Lives in its own non-`'use client'` module so server components
 * (e.g. the homepage `page.tsx`) can import the constant directly.
 * When this name was re-exported from `./postcode.ts` (a client
 * module), Next.js' client-module boundary replaced the string with
 * `undefined` on the server, breaking `cookies().get(...)` and
 * silently hiding the vendor rails.
 *
 * Format: `"<POSTCODE>"` once coverage is verified; absent means
 * "not yet entered or not covered". 30-day Max-Age, SameSite=Lax —
 * this is a UX preference, not an auth credential.
 */
export const COVERAGE_COOKIE = 'feastpot.coverage.v1';

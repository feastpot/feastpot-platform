/**
 * Supabase project identification + dev-in-prod guard.
 *
 * The platform historically shared ONE Supabase project across dev and prod
 * (ref `zibmwuzxgydlvapiddhf`). That ref is now DEVELOPMENT-ONLY; production
 * must point at its own Supabase project. These helpers centralise ref parsing
 * so the startup guard (`main.ts`) and the `/healthz` probe
 * (`health.controller.ts`) can never disagree about which project we are
 * talking to.
 */
export const DEV_SUPABASE_REF = 'zibmwuzxgydlvapiddhf';

/**
 * Extract the project ref from a Supabase URL (`https://<ref>.supabase.co`).
 * Returns `'unknown'` when the URL is absent or doesn't match the expected
 * shape (e.g. a self-hosted Supabase or a malformed value).
 */
export function getSupabaseRef(url: string = process.env.SUPABASE_URL ?? ''): string {
  return url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? 'unknown';
}

/** True when the configured Supabase URL is the known development project. */
export function isDevSupabaseRef(url?: string): boolean {
  return getSupabaseRef(url) === DEV_SUPABASE_REF;
}

/**
 * `'development'` when the URL is the known dev ref, otherwise `'production'`.
 * Mirrors the convention used by the `/healthz` probe and startup logs.
 */
export function getSupabaseEnvironment(url?: string): 'development' | 'production' {
  return isDevSupabaseRef(url) ? 'development' : 'production';
}

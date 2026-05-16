/**
 * Required environment variables for the API to operate correctly.
 *
 * Adapted from D21 spec to the *actual* env this codebase reads:
 *  - Prisma datasource is `SUPABASE_DB_URL` (not `DATABASE_URL`).
 *  - There is no `JWT_SECRET`; auth is Supabase-verified JWTs via
 *    `SUPABASE_URL` (JWKS) + `SUPABASE_SERVICE_ROLE_KEY` (admin client).
 *
 * Used by:
 *  - `main.ts` startup gate (hard-fail in production, warn in dev).
 *  - `/health/z` readiness probe (returns 503 + `missing: …` if any absent).
 */
export const REQUIRED_ENV_VARS = [
  'SUPABASE_DB_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
] as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

export function missingRequiredEnv(): RequiredEnvVar[] {
  return REQUIRED_ENV_VARS.filter((k) => !process.env[k]);
}

/**
 * Logs each missing var loudly. In production, hard-exits (1) so the
 * orchestrator surfaces the failure rather than us serving a half-broken
 * API where webhooks silently 4xx and payments never confirm.
 */
export function assertRequiredEnvOrExit(): void {
  const missing = missingRequiredEnv();
  if (missing.length === 0) return;

  for (const key of missing) {
    // eslint-disable-next-line no-console
    console.error(`[STARTUP] MISSING REQUIRED ENV VAR: ${key}`);
  }

  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error(
      `[STARTUP] Refusing to start in production with ${missing.length} missing required secret(s).`,
    );
    process.exit(1);
  }
}

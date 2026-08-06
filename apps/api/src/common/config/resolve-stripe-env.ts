/**
 * Organisational standard for Stripe credential handling.
 *
 * Stripe keys are stored as ENCRYPTED Replit Secrets under environment-specific
 * names - never as plaintext, git-tracked `.replit` environment variables:
 *
 *   STRIPE_SECRET_KEY_LIVE      /  STRIPE_SECRET_KEY_TEST
 *   STRIPE_WEBHOOK_SECRET_LIVE  /  STRIPE_WEBHOOK_SECRET_TEST
 *
 * Because Replit Secrets are global (identical in development and production),
 * both the LIVE and TEST values are present in every runtime. This shim copies
 * the correct one into the canonical variable the rest of the codebase reads
 * (`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`), selected by `NODE_ENV`:
 *
 *   - NODE_ENV === 'production'  ->  *_LIVE
 *   - anything else (dev/test)   ->  *_TEST
 *
 * This keeps the live key encrypted at rest and out of version control while
 * still giving production live credentials and development test credentials,
 * which scoped (plaintext) env vars cannot do simultaneously on Replit.
 *
 * Contract:
 *   - MUST run before `assertRequiredEnvOrExit()` and before
 *     `NestFactory.create()` (ConfigModule snapshots `process.env` at init).
 *   - Never overwrites an already-set canonical variable, so an explicit
 *     legacy `STRIPE_SECRET_KEY` still wins during migration.
 *   - A missing source secret is left untouched (the existing required-env
 *     gate / loud warnings handle absence).
 */
export function resolveStripeEnv(): void {
  const suffix = process.env.NODE_ENV === 'production' ? 'LIVE' : 'TEST';

  const canonicalToSourced: ReadonlyArray<readonly [string, string]> = [
    ['STRIPE_SECRET_KEY', `STRIPE_SECRET_KEY_${suffix}`],
    ['STRIPE_WEBHOOK_SECRET', `STRIPE_WEBHOOK_SECRET_${suffix}`],
  ];

  for (const [canonical, sourced] of canonicalToSourced) {
    const value = process.env[sourced];
    if (value && !process.env[canonical]) {
      process.env[canonical] = value;
    }
  }
}

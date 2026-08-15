/**
 * Startup environment guard.
 *
 * Two tiers:
 *
 * REQUIRED -- the API cannot function correctly without these. Missing any one
 *   of them causes a silent failure somewhere critical (payments fail, auth
 *   rejects every request, queues never drain). We print every missing var at
 *   once and exit(1) in production so the orchestrator surfaces the problem
 *   immediately rather than us serving a half-broken API.
 *
 * OPTIONAL_WITH_CONSEQUENCE -- the API starts, but a specific subsystem
 *   degrades silently. Logging each gap at startup means ops discovers the gap
 *   from a boot log, not from a vendor complaint or a missed chargeback alert.
 *
 * Local development: required vars log but do not block (contributors can run
 * a partial stack without every secret). Optional vars are also only logged so
 * contributors know what they are missing without being blocked.
 *
 * Used by:
 *  - `main.ts` bootstrap gate (called before NestFactory so all gaps surface
 *    together, before any subsystem has a chance to fail silently).
 *  - `/health/z` readiness probe (returns 503 + `missing: ...` if any absent).
 */

export const REQUIRED_ENV_VARS = [
  // ── Database ──────────────────────────────────────────────────────────────
  // Prisma datasource URL; Supabase session-pooler (port 5432). Everything
  // that touches the DB (orders, payments, users, notifications) fails without
  // this. SUPABASE_DIRECT_URL (port 5432 direct) is only needed for
  // migrations / psql; it is optional at API runtime.
  'SUPABASE_DB_URL',

  // ── Auth ──────────────────────────────────────────────────────────────────
  // JWKS endpoint for verifying Supabase JWTs. Every authenticated endpoint
  // returns 401 without this.
  'SUPABASE_URL',
  // Admin Supabase client (user management, auth-hook, service-to-service).
  // Vendor approval, user suspension, and the auth hook all fail without it.
  'SUPABASE_SERVICE_ROLE_KEY',

  // ── Queue / cache / throttler ─────────────────────────────────────────────
  // BullMQ (order jobs, notifications, payouts), RedisCacheService, and the
  // rate-limiter all connect to the same Redis instance. Format checks
  // (localhost guard, rediss:// TLS) run separately after this gate -- they
  // only apply when the URL is present and set.
  'REDIS_URL',

  // ── Payments ──────────────────────────────────────────────────────────────
  // Resolved from STRIPE_SECRET_KEY_{LIVE,TEST} by resolveStripeEnv() before
  // this gate runs. Without these, every charge, transfer, and webhook
  // verification fails immediately.
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
] as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

/**
 * Subsystems that degrade silently when their env vars are absent.
 * Each entry documents the consequence so ops knows exactly what is lost.
 *
 * Groups: all keys in a group must be present for the subsystem to function.
 * If any key in a group is absent, the whole group is considered unconfigured.
 */
export const OPTIONAL_ENV_CONSEQUENCES: ReadonlyArray<{
  /** All vars in the group must be set for the subsystem to function. */
  readonly keys: readonly string[];
  /** Human-readable consequence shown in the startup warning. */
  readonly consequence: string;
}> = [
  {
    keys: ['RESEND_API_KEY', 'EMAIL_FROM'],
    consequence: 'email notifications will not be sent (orders, vendor alerts, digests)',
  },
  {
    keys: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'],
    consequence: 'WhatsApp notifications will not be sent',
  },
  {
    keys: ['QUEUE_ALERT_SLACK_WEBHOOK_URL'],
    consequence:
      'Slack queue-depth, stuck-order, and chargeback-deadline alerts will not fire -- monitoring is degraded',
  },
];

export function missingRequiredEnv(): RequiredEnvVar[] {
  return REQUIRED_ENV_VARS.filter((k) => !process.env[k]);
}

/**
 * Returns the optional groups whose vars are not fully set,
 * paired with their consequence description.
 */
export function incompleteOptionalEnv(): Array<{
  keys: readonly string[];
  consequence: string;
}> {
  return OPTIONAL_ENV_CONSEQUENCES.filter(({ keys }) => keys.some((k) => !process.env[k]));
}

/**
 * Logs each missing REQUIRED var loudly. In production, hard-exits (1) after
 * printing all missing vars at once so the orchestrator surfaces the failure
 * rather than the API running in a broken state.
 *
 * Also calls warnOptionalEnv() to surface optional-var gaps in the same boot
 * log pass.
 */
export function assertRequiredEnvOrExit(): void {
  const missing = missingRequiredEnv();
  if (missing.length > 0) {
    // Print all missing vars at once -- never just the first.
    for (const key of missing) {
      // eslint-disable-next-line no-console
      console.error(`[STARTUP] MISSING REQUIRED ENV VAR: ${key}`);
    }
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.error(
        `[STARTUP] Refusing to start in production with ${missing.length} missing required secret(s). ` +
          `Set the above var(s) in Replit deployment secrets and redeploy.`,
      );
      process.exit(1);
    }
    // In development: log but do not block. Partial stacks are valid for
    // contributors who do not have every secret configured locally.
  }

  warnOptionalEnv();
}

/**
 * Logs a warning for each optional subsystem that is missing its env vars.
 * Never blocks startup. Safe to call in both production and development.
 */
export function warnOptionalEnv(): void {
  for (const { keys, consequence } of incompleteOptionalEnv()) {
    const missing = keys.filter((k) => !process.env[k]);
    // eslint-disable-next-line no-console
    console.warn(`[STARTUP] Optional env not fully set (${missing.join(', ')}): ${consequence}.`);
  }
}

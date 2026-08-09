/**
 * Next.js instrumentation hook, loaded automatically at startup on both
 * server and edge runtimes.
 *
 * Sentry wiring: when NEXT_PUBLIC_SENTRY_DSN is set, initialise Sentry here
 * to capture server-side exceptions. The vendor portal error boundary
 * (error.tsx / global-error.tsx) persists incidents via the API regardless
 * of whether Sentry is configured, so "It's been logged" is always true.
 *
 * To complete Sentry integration:
 *   1. Install:  npm install @sentry/nextjs --workspace=apps/vendor
 *   2. Set env:  NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
 *   3. Uncomment the block below and delete this comment.
 *
 *   import * as Sentry from '@sentry/nextjs';
 *   export async function register() {
 *     Sentry.init({
 *       dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
 *       enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
 *       tracesSampleRate: 0.1,
 *       environment: process.env.NODE_ENV,
 *     });
 *   }
 */

export async function register(): Promise<void> {
  // No-op until NEXT_PUBLIC_SENTRY_DSN is configured.
}

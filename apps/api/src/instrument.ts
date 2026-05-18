/**
 * Sentry instrumentation - MUST be imported before anything else in main.ts so
 * its OpenTelemetry hooks can patch http/express/nestjs at require-time.
 *
 * Reads SENTRY_DSN from the environment. When unset (e.g. local dev without a
 * DSN configured), Sentry initialises in a no-op state and stays silent.
 */
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const env = process.env.NODE_ENV ?? 'development';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: env,
  integrations: [nodeProfilingIntegration()],
  // Lower sampling in production to control event volume; sample everything
  // locally so developers can see traces while iterating.
  tracesSampleRate: env === 'production' ? 0.1 : 1.0,
  profilesSampleRate: 0.1,
  // Only send events when a DSN is actually configured.
  enabled: Boolean(process.env.SENTRY_DSN),
});

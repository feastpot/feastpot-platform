import type { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

/**
 * Providers fall back to a log-only "stub" mode when their credentials are
 * missing. That is fine in dev/test, but in production it silently drops
 * every send on that channel. This raises a loud startup alert (error log +
 * Sentry event) so a misconfigured deploy is caught immediately instead of
 * being discovered via missing customer notifications.
 *
 * In non-production environments it keeps the original quiet warning.
 */
export function alertIfStubInProduction(logger: Logger, channel: string, reason: string): void {
  const message = `${channel} provider is in STUB mode (${reason}) - sends will be logged only, never delivered.`;
  if (process.env.NODE_ENV === 'production') {
    logger.error(`PRODUCTION MISCONFIGURATION: ${message}`);
    Sentry.captureMessage(`Notification provider in stub mode in production: ${channel}`, {
      level: 'error',
      extra: { channel, reason },
    });
  } else {
    logger.warn(message);
  }
}

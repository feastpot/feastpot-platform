import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

import { RedisCacheService } from '../../common/cache/redis-cache.service';

const RESET_MIN_MS = 800; // timing-normalisation floor (ms)
const EMAIL_RATE_WINDOW_SECS = 60 * 60; // 1 hour
const EMAIL_RATE_MAX = 3; // max 3 reset attempts per email per window

/**
 * SHA-256 hash of the email so we store no PII in Redis.
 * Key format: auth:reset:email:<sha256hex>
 */
function emailRateKey(email: string): string {
  return `auth:reset:email:${createHash('sha256').update(email.toLowerCase()).digest('hex')}`;
}

@Injectable()
export class AuthPublicService {
  private readonly logger = new Logger(AuthPublicService.name);
  private readonly supabase: SupabaseClient;
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly webOrigin: string;
  private readonly vendorOrigin: string;

  constructor(
    private readonly config: ConfigService,
    /**
     * RedisCacheService is @Global (via CacheModule) so it is injectable
     * here without importing CacheModule again. Its `increment()` method is
     * used for per-email rate limiting across all API instances.
     *
     * Fail-open: if Redis is unavailable, `increment()` returns 0 so the
     * reset request is allowed through. A Redis outage should not lock users
     * out of their accounts.
     */
    private readonly cache: RedisCacheService,
  ) {
    // We use the anon key to call resetPasswordForEmail - this is an
    // unauthenticated Supabase Auth operation, not a service-role call.
    const supabaseUrl = (
      config.get<string>('SUPABASE_URL') ??
      config.get<string>('NEXT_PUBLIC_SUPABASE_URL') ??
      ''
    )
      .replace(/\/rest\/v1\/?$/, '')
      .replace(/\/+$/, '');

    const anonKey =
      config.get<string>('SUPABASE_ANON_KEY') ??
      config.get<string>('NEXT_PUBLIC_SUPABASE_ANON_KEY') ??
      '';

    if (!supabaseUrl || !anonKey) {
      this.logger.warn(
        'SUPABASE_URL / SUPABASE_ANON_KEY not configured - password reset emails will fail',
      );
    }

    this.supabase = createClient(
      supabaseUrl || 'http://placeholder.local',
      anonKey || 'placeholder',
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );

    const resendKey = config.get<string>('RESEND_API_KEY');
    this.resend = resendKey ? new Resend(resendKey) : null;
    this.from = config.get<string>('EMAIL_FROM') ?? 'Feastpot <noreply@feastpot.co.uk>';

    this.webOrigin = config.get<string>('NEXT_PUBLIC_WEB_URL') ?? 'https://feastpot.co.uk';
    this.vendorOrigin = config.get<string>('VENDOR_PORTAL_URL') ?? 'https://vendors.feastpot.co.uk';
  }

  /**
   * Trigger a Supabase password-reset email for `email`.
   *
   * Security properties:
   *  - Per-IP rate limiting enforced at the controller level via @Throttle.
   *  - Per-email rate limiting via Redis INCR (max EMAIL_RATE_MAX per hour,
   *    shared across all API instances). Key is SHA-256(email) so no PII
   *    lands in Redis. Fail-open: Redis unavailable → allow through.
   *  - Timing normalised to >= RESET_MIN_MS so timing side-channels cannot
   *    distinguish "email registered" from "email not registered".
   *  - Always returns void; callers MUST respond 200 OK regardless.
   */
  async resetRequest(email: string, app: 'customer' | 'vendor'): Promise<void> {
    const start = Date.now();

    // Per-email rate limit via Redis INCR+EXPIRE.
    // Returns 0 when Redis is down (fail-open).
    const count = await this.cache.increment(emailRateKey(email), EMAIL_RATE_WINDOW_SECS);
    if (count > EMAIL_RATE_MAX) {
      // Silently wait out the timing floor and return - same UX as success.
      this.logger.debug(
        `[auth-public] Per-email rate limit hit for hash ${emailRateKey(email).slice(-8)}`,
      );
      await this.delay(RESET_MIN_MS);
      return;
    }

    const origin = app === 'vendor' ? this.vendorOrigin : this.webOrigin;
    const redirectTo = `${origin}/auth/callback?type=recovery&next=/auth/reset/update`;

    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        // Non-fatal - the response is indistinguishable from success to
        // prevent email enumeration.
        this.logger.warn(`[auth-public] resetPasswordForEmail non-fatal error: ${error.message}`);
      }
    } catch (err) {
      this.logger.warn(`[auth-public] resetPasswordForEmail threw (non-fatal): ${String(err)}`);
    }

    // Timing normalisation: ensure at least RESET_MIN_MS elapsed so a
    // fast "email not found" path cannot be timed against a slow "found" path.
    const elapsed = Date.now() - start;
    if (elapsed < RESET_MIN_MS) {
      await this.delay(RESET_MIN_MS - elapsed);
    }
  }

  /**
   * Send a branded "your password was changed" advisory email.
   * Called after `supabase.auth.updateUser({ password })` succeeds on the
   * client. Failure is non-fatal (logged at warn level).
   */
  async notifyPasswordChanged(userEmail: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn('[auth-public] RESEND_API_KEY not set - password-changed email skipped');
      return;
    }
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: userEmail,
      subject: 'Your Feastpot password was changed',
      html: this.buildPasswordChangedHtml(userEmail),
    });
    if (error) {
      // Non-fatal: password is already updated; email is advisory.
      this.logger.warn(`[auth-public] password-changed email failed: ${JSON.stringify(error)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Minimal branded HTML for the password-changed advisory email.
   * Mirrors supabase/templates/password_changed.html in structure.
   */
  private buildPasswordChangedHtml(email: string): string {
    const escapedEmail = email.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your Feastpot password was changed</title>
</head>
<body style="margin:0;padding:0;background-color:#f9f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f9f5f0;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.07);">
        <tr><td style="background-color:#0a4a4a;padding:24px 32px;">
          <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">&#x1F372; Feastpot</p>
        </td></tr>
        <tr><td style="padding:36px 32px 24px;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:#1a1a1a;letter-spacing:-0.4px;">
            Your password was changed
          </h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#444444;">
            The password for your Feastpot account
            <strong style="color:#1a1a1a;">${escapedEmail}</strong>
            was just updated. All other active sessions have been signed out as a security precaution.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                 style="background:#fff8f0;border:1px solid #f0d090;border-radius:8px;margin-bottom:28px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0;font-size:14px;line-height:1.55;color:#7a4000;">
                <strong>Didn&#x2019;t make this change?</strong>
                Contact us immediately at
                <a href="mailto:hello@feastpot.co.uk" style="color:#b05a00;">hello@feastpot.co.uk</a>
                so we can secure your account.
              </p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #ede8e3;">
          <p style="margin:0;font-size:12px;color:#999999;line-height:1.5;">
            Feastpot Ltd. This is a security notification; you cannot unsubscribe from it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }
}

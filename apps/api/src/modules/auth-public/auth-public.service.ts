import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const RESET_MIN_MS = 800; // timing-normalization floor (ms)
const EMAIL_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_RATE_MAX = 3; // max 3 reset attempts per email per window

interface RateEntry {
  count: number;
  windowStart: number;
}

@Injectable()
export class AuthPublicService {
  private readonly logger = new Logger(AuthPublicService.name);
  private readonly supabase: SupabaseClient;
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly webOrigin: string;
  private readonly vendorOrigin: string;

  /**
   * In-memory per-email rate-limit store.
   *
   * A lightweight alternative to a Redis SET for a single-process API.
   * NOTE: In a horizontally-scaled deployment this must be replaced with a
   * Redis-backed store (e.g. via the existing IORedis connection) so the
   * limit is enforced across all instances.
   */
  private readonly emailRateMap = new Map<string, RateEntry>();

  constructor(private readonly config: ConfigService) {
    // We use the anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) to call
    // resetPasswordForEmail, which is an unauthenticated Supabase Auth
    // operation - it does NOT require the service role.
    const supabaseUrl = (config.get<string>('SUPABASE_URL') ?? config.get<string>('NEXT_PUBLIC_SUPABASE_URL') ?? '')
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

    this.supabase = createClient(supabaseUrl || 'http://placeholder.local', anonKey || 'placeholder', {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const resendKey = config.get<string>('RESEND_API_KEY');
    this.resend = resendKey ? new Resend(resendKey) : null;
    this.from = config.get<string>('EMAIL_FROM') ?? 'Feastpot <noreply@feastpot.co.uk>';

    this.webOrigin =
      config.get<string>('NEXT_PUBLIC_WEB_URL') ?? 'https://feastpot.co.uk';
    this.vendorOrigin =
      config.get<string>('VENDOR_PORTAL_URL') ?? 'https://vendors.feastpot.co.uk';
  }

  /**
   * Trigger a Supabase password-reset email for `email`.
   *
   * Security properties:
   *  - Per-IP rate limiting is enforced at the controller level by @Throttle.
   *  - Per-email rate limiting is enforced here (max EMAIL_RATE_MAX per hour).
   *  - Timing is normalised to at least RESET_MIN_MS so timing side-channels
   *    cannot distinguish "email registered" from "email not registered".
   *  - The method always returns void; callers should always respond 200 OK.
   *
   * `redirectTo` is constructed from the `app` field so the reset link
   * drops the vendor back at the vendor portal or the customer back at
   * feastpot.co.uk as appropriate. Both land on /auth/callback which
   * exchanges the Supabase code for a session and routes to /auth/reset/update.
   */
  async resetRequest(email: string, app: 'customer' | 'vendor'): Promise<void> {
    const start = Date.now();

    if (!this.checkEmailRateLimit(email)) {
      // Rate-limited: wait out the minimum time then return silently.
      await this.delay(RESET_MIN_MS);
      return;
    }

    const origin = app === 'vendor' ? this.vendorOrigin : this.webOrigin;
    const redirectTo = `${origin}/auth/callback?type=recovery&next=/auth/reset/update`;

    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        // Not surfaced to the caller - keeps the response indistinguishable
        // from a success so attackers cannot enumerate registered emails.
        this.logger.warn(`[auth-public] resetPasswordForEmail non-fatal error: ${error.message}`);
      }
    } catch (err) {
      this.logger.warn(`[auth-public] resetPasswordForEmail threw (non-fatal): ${String(err)}`);
    }

    const elapsed = Date.now() - start;
    if (elapsed < RESET_MIN_MS) {
      await this.delay(RESET_MIN_MS - elapsed);
    }
  }

  /**
   * Send a branded "your password was changed" confirmation email.
   *
   * Called after `supabase.auth.updateUser({ password })` succeeds on the
   * client. The endpoint is auth-guarded so we know `userEmail` is the
   * authenticated user's own address. Failure is non-fatal (logged at warn).
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

  /**
   * Returns true if the email is within the rate-limit budget, incrementing
   * the counter. Returns false if the budget is exhausted.
   */
  private checkEmailRateLimit(email: string): boolean {
    const now = Date.now();
    const entry = this.emailRateMap.get(email);
    if (!entry || now - entry.windowStart >= EMAIL_RATE_WINDOW_MS) {
      // Fresh window
      this.emailRateMap.set(email, { count: 1, windowStart: now });
      this.evictEmailRateMap();
      return true;
    }
    if (entry.count >= EMAIL_RATE_MAX) {
      return false;
    }
    entry.count++;
    return true;
  }

  /** Evict expired entries to prevent unbounded growth. */
  private evictEmailRateMap(): void {
    if (this.emailRateMap.size < 500) return;
    const now = Date.now();
    for (const [key, entry] of this.emailRateMap) {
      if (now - entry.windowStart >= EMAIL_RATE_WINDOW_MS) {
        this.emailRateMap.delete(key);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Minimal branded HTML for the password-changed advisory email.
   * Mirrors supabase/templates/password_changed.html in structure.
   * Plain-text fallback is provided by the Resend client automatically.
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

        <!-- Header -->
        <tr><td style="background-color:#0a4a4a;padding:24px 32px;">
          <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">&#x1F372; Feastpot</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 32px 24px;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:800;color:#1a1a1a;letter-spacing:-0.4px;">
            Your password was changed
          </h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#444444;">
            The password for your Feastpot account
            <strong style="color:#1a1a1a;">${escapedEmail}</strong>
            was just updated. All other active sessions have been signed out as a security precaution.
          </p>

          <!-- Security alert box -->
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

        <!-- Footer -->
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #ede8e3;">
          <p style="margin:0;font-size:12px;color:#999999;line-height:1.5;">
            Feastpot Ltd &bull; This is a security notification. You cannot unsubscribe from security emails.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }
}

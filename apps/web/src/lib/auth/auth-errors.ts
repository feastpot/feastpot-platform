/**
 * Supabase Auth error mapping for registration.
 *
 * Per Supabase guidance: always identify errors by `error.code` and
 * `error.name`, never by string-matching on `error.message` (message text
 * is not part of the stable API and changes between GoTrue releases.
 *
 * Import `mapSignUpError` wherever a signUp() call handles errors.
 * Import `shouldAlertOps` to decide whether to emit a server-side alert.
 */

// AuthError type from the SDK exposes `code` on AuthApiError subclasses.
// We widen the type locally to avoid casting at every call site.
interface SupabaseAuthError {
  name: string;
  message: string;
  status?: number;
  code?: string;
  // Present on AuthWeakPasswordError only
  weak_password?: { reasons?: string[] };
}

// ---------------------------------------------------------------------------
// Reason messages for AuthWeakPasswordError
// ---------------------------------------------------------------------------

const WEAK_PASSWORD_REASONS: Record<string, string> = {
  pwned: 'This password has appeared in a known data breach. Please choose a different one.',
  length: 'Your password must be at least 8 characters long.',
  characters: 'Your password must include uppercase, lowercase, a number and a special character.',
};

// ---------------------------------------------------------------------------
// Error code map
// ---------------------------------------------------------------------------

export interface AuthErrorMapping {
  userMessage: string;
  /** True for transient conditions (rate-limit, degraded service). */
  isTransient?: boolean;
  /** True when ops should be alerted (service misconfiguration, unexpected failure). */
  alertOps?: boolean;
}

/**
 * Maps Supabase error.code values to user-facing messages.
 * All messages are in UK English and do not reveal account existence.
 */
export const AUTH_ERROR_MAP: Record<string, AuthErrorMapping> = {
  over_email_send_rate_limit: {
    userMessage: 'Too many attempts. Please wait a few minutes before trying again.',
    isTransient: true,
  },
  user_already_exists: {
    // Only fires when email confirmations are OFF. Keep neutral to avoid
    // hinting whether the account exists.
    userMessage:
      'We could not complete your registration. If you already have an account, try signing in or resetting your password.',
  },
  signup_disabled: {
    userMessage: 'We are not accepting new registrations right now. Please try again shortly.',
    alertOps: true,
  },
  email_provider_disabled: {
    userMessage: 'We cannot send confirmation emails right now. Please try again shortly.',
    alertOps: true,
  },
  unexpected_failure: {
    userMessage: 'Something went wrong on our end. Please try again in a moment.',
    alertOps: true,
  },
  validation_failed: {
    userMessage: 'Some of the details you entered are not valid. Please check and try again.',
  },
  email_address_invalid: {
    userMessage: 'That email address does not look valid. Please check it and try again.',
  },
  // Supabase built-in SMTP refuses to deliver to addresses that are not members
  // of the project organisation (2 msg/hour cap, team-only). Surface this as an
  // ops alert so misconfigured SMTP is detected before launch.
  email_address_not_authorized: {
    userMessage: 'We were unable to send a confirmation email to that address. Please try again shortly or contact support.',
    alertOps: true,
  },
};

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Map a Supabase Auth error from a signUp() call into a user-facing message.
 * Returns a string in UK English suitable for displaying in the form banner.
 */
export function mapSignUpError(error: SupabaseAuthError): string {
  // AuthWeakPasswordError carries a reasons array with specific detail.
  if (error.name === 'AuthWeakPasswordError') {
    const reasons = error.weak_password?.reasons ?? [];
    if (reasons.length > 0) {
      return reasons
        .map(
          (r) =>
            WEAK_PASSWORD_REASONS[r] ??
            `Your password does not meet the following requirement: ${r}.`,
        )
        .join(' ');
    }
    // Fallback if reasons is empty but the error type is correct.
    return 'Your password does not meet the strength requirements. Please choose a stronger password.';
  }

  // All other errors: look up by code first.
  const code = error.code ?? '';
  const mapping = AUTH_ERROR_MAP[code];
  if (mapping) return mapping.userMessage;

  // Final safety net: if we reach here the error code is not in AUTH_ERROR_MAP.
  // The modern Supabase SDK guarantees human-readable strings in error.message
  // for all documented error types; surface it if it is a non-empty plain string.
  // The legacy GoTrue JSON-guard (startsWith '{') has been removed -- the modern
  // SDK no longer wraps messages in JSON objects.
  const raw = (error.message ?? '').trim();
  if (raw && raw !== '{}') return raw;

  // Truly undocumented error with no usable message. The caller will have already
  // logged a console.error via shouldAlertOps(); show a neutral service notice.
  return 'Something went wrong. Please try again in a moment.';
}

/**
 * Returns true when the error indicates a service-level problem that the
 * operations team should be alerted about (e.g. signups disabled, SMTP down).
 */
export function shouldAlertOps(error: SupabaseAuthError): boolean {
  const code = error.code ?? '';
  return AUTH_ERROR_MAP[code]?.alertOps ?? false;
}

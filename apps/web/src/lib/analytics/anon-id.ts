/**
 * Anonymous visitor ID for the vendor-acquisition analytics funnel.
 *
 * Stored in localStorage under `fp_anon` so it persists across page loads
 * without requiring a cookie (no cookie-consent banner needed for a purely
 * technical identifier that never leaves this browser).
 *
 * Not HttpOnly so it is intentionally not used for session security - it is
 * only for correlating funnel events from the same anonymous session.
 *
 * PII policy: this ID is a random UUID that has no connection to any user
 * account, email, or other personal data.
 */

const STORAGE_KEY = 'fp_anon';

/**
 * Return the stored anonymous visitor ID, creating and persisting a new one
 * if none exists.  Returns 'unknown' if localStorage is unavailable (SSR,
 * private-browsing lockdown, or storage quota exceeded).
 */
export function getOrCreateAnonId(): string {
  try {
    const existing = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return 'unknown';
  }
}

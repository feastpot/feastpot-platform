/**
 * Anonymous visitor ID for the vendor-portal analytics events.
 * Same implementation as apps/web/src/lib/analytics/anon-id.ts.
 * Kept separate to avoid a cross-app package dependency.
 */

const STORAGE_KEY = 'fp_anon';

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

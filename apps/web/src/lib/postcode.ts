'use client';

import { useEffect, useState } from 'react';

const KEY = 'feastpot.postcode.v1';
/**
 * Server-readable mirror of the user's confirmed coverage. Set as a cookie
 * (not just localStorage) so the homepage server component can render the
 * post-postcode layout — vendor rails, popular kitchens, featured cooks —
 * without a client roundtrip. Format: `"<POSTCODE>"` once coverage is
 * verified; absent means "not yet entered or not covered".
 *
 * `Max-Age=2592000` = 30 days. `SameSite=Lax` is enough — this is a
 * UX preference, not an auth credential.
 */
export const COVERAGE_COOKIE = 'feastpot.coverage.v1';

/**
 * Quick localStorage-backed postcode preference. Lives client-only — the
 * homepage hero writes here and the vendor search page reads it as a default.
 *
 * Postcode is stored as upper-cased + space-stripped to keep cache keys
 * deterministic across capitalisation differences.
 */
export function normalisePostcode(input: string): string {
  return input.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Strict UK-postcode shape check. Accepts either the outward code alone
 * (e.g. "SE15") or a full postcode (e.g. "SE15 4ST" / "SE154ST"); whitespace
 * and case are normalised before matching. Used at form submission time to
 * reject obvious garbage like "asdf" before we route the user into the
 * vendor search and waste an API round-trip.
 *
 * Note: this is a SHAPE check — it does not verify the postcode actually
 * exists (Royal Mail's PAF database is paywalled). Real existence is
 * checked downstream by the geocode/vendor-search call.
 */
export function isValidUKPostcode(postcode: string): boolean {
  const clean = postcode.replace(/\s+/g, '').toUpperCase();
  // Outward: 1-2 letters, 1 digit, optional letter-or-digit.
  // Inward (optional): 1 digit + 2 letters.
  const regex = /^[A-Z]{1,2}\d[A-Z\d]?(\d[A-Z]{2})?$/;
  return regex.test(clean);
}

export function readStoredPostcode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeStoredPostcode(value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(KEY, value);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Quota / privacy mode — best-effort, ignore.
  }
}

export function writeCoverageCookie(postcode: string | null): void {
  if (typeof document === 'undefined') return;
  // Only set Secure over HTTPS — local dev runs on http://localhost so the
  // browser would silently drop a Secure cookie there.
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  if (postcode) {
    const v = encodeURIComponent(normalisePostcode(postcode));
    document.cookie = `${COVERAGE_COOKIE}=${v}; Path=/; Max-Age=2592000; SameSite=Lax${secure}`;
  } else {
    document.cookie = `${COVERAGE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  }
}

export function useStoredPostcode(): [string | null, (next: string | null) => void] {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    setValue(readStoredPostcode());
  }, []);
  const set = (next: string | null) => {
    const v = next ? normalisePostcode(next) : null;
    setValue(v);
    writeStoredPostcode(v);
  };
  return [value, set];
}

'use client';

import { useEffect, useState } from 'react';

const KEY = 'feastpot.postcode.v1';

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

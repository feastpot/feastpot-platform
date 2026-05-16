import { apiRequest } from './client';
import { searchVendors } from './vendors';

export type CoverageResult =
  | { status: 'covered' }
  | { status: 'uncovered' }
  | { status: 'error'; message: string };

/**
 * Coverage check — does Feastpot have at least one live vendor delivering to
 * this postcode? Powers the postcode gate on the homepage: covered postcodes
 * unlock the vendor rails; uncovered ones route to /waitlist.
 *
 * Tri-state result: a transient network error must NOT silently grant
 * coverage (and burn a 30-day cookie) — callers surface a retry prompt
 * instead. Implemented as a `limit=1` search against the existing public
 * vendor endpoint to avoid forking a second source of truth.
 */
export async function checkCoverage(
  postcode: string,
  options?: { signal?: AbortSignal },
): Promise<CoverageResult> {
  try {
    const res = await searchVendors({ postcode, limit: 1 }, { signal: options?.signal });
    return res.data.length > 0 ? { status: 'covered' } : { status: 'uncovered' };
  } catch (err) {
    return {
      status: 'error',
      message:
        err instanceof Error
          ? err.message
          : "We couldn't check coverage just now. Please try again.",
    };
  }
}

export interface RegisterCoverageInterestInput {
  email: string;
  postcode: string;
  name?: string;
  marketingConsent?: boolean;
}

export function registerCoverageInterest(input: RegisterCoverageInterestInput): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/coverage-interest', {
    method: 'POST',
    body: input,
  });
}

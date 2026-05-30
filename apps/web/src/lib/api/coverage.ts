import { apiRequest } from './client';
import { searchVendors } from './vendors';

export type CoverageResult =
  | { status: 'covered' }
  | { status: 'uncovered' }
  | { status: 'error'; message: string };

/**
 * Coverage check - does Feastpot have at least one live vendor delivering to
 * this postcode? Powers the postcode gate on the homepage: covered postcodes
 * unlock the vendor rails; uncovered ones route to /waitlist.
 *
 * Tri-state result: a transient network error must NOT silently grant
 * coverage (and burn a 30-day cookie) - callers surface a retry prompt
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

/**
 * Per-vendor delivery coverage verdict. Distinct from the homepage `CoverageResult`
 * (which answers "does ANY vendor serve this postcode?"). This answers "does
 * THIS vendor deliver to a customer whose address is `distanceMiles` away?".
 *
 * We deliberately work from a pre-computed distance (the API already returns a
 * haversine `distanceKm` for the profile + checkout flows) rather than
 * geocoding on the client: it avoids exposing a home cook's exact coordinates
 * to the browser and keeps the distance number identical to the server's.
 */
export type DeliveryCoverageVerdict =
  | { state: 'unknown' }
  | { state: 'covered'; distanceMiles: number; radiusMiles: number }
  | { state: 'outside'; distanceMiles: number; radiusMiles: number };

/**
 * Decide whether a vendor delivers to an address, given the distance to it and
 * the vendor's local delivery radius (both in miles). Returns `unknown` when we
 * can't tell - no postcode entered yet, the vendor hasn't set a service area,
 * or geocoding failed upstream - so callers can show a neutral prompt instead
 * of a false "outside area" warning.
 *
 * The local radius ONLY constrains `local` delivery. A vendor whose effective
 * delivery mode is `nationwide` (or collection) serves addresses any distance
 * away, so when `deliveryType` is supplied and is not `local` we return
 * `unknown` - the radius is irrelevant and applying it would wrongly flag a
 * valid order as "outside area". Mirrors the server-side geofence gate. When
 * `deliveryType` is omitted we assume local (the historical default).
 */
export function evaluateDeliveryCoverage(
  distanceMiles: number | null | undefined,
  radiusMiles: number | null | undefined,
  deliveryType?: string | null,
): DeliveryCoverageVerdict {
  // Radius only applies to local delivery; non-local modes are never "outside".
  if (deliveryType != null && deliveryType !== 'local') {
    return { state: 'unknown' };
  }
  if (
    typeof distanceMiles !== 'number' ||
    !Number.isFinite(distanceMiles) ||
    distanceMiles < 0 ||
    typeof radiusMiles !== 'number' ||
    !Number.isFinite(radiusMiles) ||
    radiusMiles <= 0
  ) {
    return { state: 'unknown' };
  }
  return distanceMiles <= radiusMiles
    ? { state: 'covered', distanceMiles, radiusMiles }
    : { state: 'outside', distanceMiles, radiusMiles };
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

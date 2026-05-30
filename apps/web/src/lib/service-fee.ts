/**
 * Client mirror of the server's service-fee clamp
 * (`apps/api/src/common/config/service-fee.ts`). The bps rate itself comes from
 * the API at request time (`coverageVendor.platformServiceFeeBps`) so it can
 * never drift; the min/max bounds are product constants kept in sync here so the
 * checkout estimate equals the amount the server actually charges.
 */
export const SERVICE_FEE_MIN_PENCE = 50;
export const SERVICE_FEE_MAX_PENCE = 299;

export function calcServiceFeePence(
  subtotalPence: number,
  bps: number | null | undefined,
): number {
  if (!bps || bps <= 0) return 0;
  const raw = Math.round((subtotalPence * bps) / 10_000);
  return Math.max(SERVICE_FEE_MIN_PENCE, Math.min(SERVICE_FEE_MAX_PENCE, raw));
}

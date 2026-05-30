/**
 * Platform service fee, read from `SERVICE_FEE_BPS` at call time so the fee can
 * change via env without a code deploy. Single source of truth shared by order
 * pricing (`orders.service`) and the public vendor profile (`vendors.service`),
 * so the customer-facing express-checkout total can never drift from the amount
 * actually charged. Defaults to 0 (failsafe): any unset, unparseable, or
 * negative value yields 0 so a misconfigured env can never charge an unintended
 * fee. The live platform value (500 bps = 5%) is supplied via the env/secret.
 *
 * When charged, the fee is clamped to [minPence, maxPence] so tiny baskets are
 * never charged a trivial fee and large baskets are capped. The clamp bounds are
 * product constants; the web checkout mirrors them in `lib/service-fee.ts`.
 */
export const SERVICE_FEE_CONFIG = {
  minPence: 50, // £0.50 floor (only applied when bps > 0)
  maxPence: 299, // £2.99 ceiling
} as const;

export function getServiceFeeBps(): number {
  const bps = Number.parseInt(process.env.SERVICE_FEE_BPS ?? '0', 10);
  if (!Number.isFinite(bps) || bps < 0) return 0;
  return bps;
}

/**
 * Compute the service fee in pence for a given subtotal. Returns 0 when the fee
 * is disabled (bps <= 0); otherwise applies the bps rate then clamps to the
 * [min, max] window.
 */
export function calculateServiceFee(subtotalPence: number): number {
  const bps = getServiceFeeBps();
  if (bps <= 0) return 0;
  const raw = Math.round((subtotalPence * bps) / 10_000);
  return Math.max(SERVICE_FEE_CONFIG.minPence, Math.min(SERVICE_FEE_CONFIG.maxPence, raw));
}

/** Back-compat alias retained for existing call sites (e.g. `orders.service`). */
export function getServiceFeePence(subtotalPence: number): number {
  return calculateServiceFee(subtotalPence);
}

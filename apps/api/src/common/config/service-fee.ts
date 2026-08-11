/**
 * Platform service fee - API side.
 *
 * The canonical formula lives in packages/config/src/service-fee.ts.
 * This module re-exports it and provides legacy aliases so existing
 * call-sites (orders.service, vendors.service) keep working unchanged.
 *
 * `getServiceFeeBps()` is retained for the vendor profile endpoint which
 * still attaches `platformServiceFeeBps` as a convenience field. The env
 * var has no bearing on what the order is charged - only the PLATFORM_FACTS-
 * backed `computeServiceFeePence` determines that.
 */
import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { computeServiceFeePence as _compute } from '@feastpot/config/service-fee';

export { computeServiceFeePence } from '@feastpot/config/service-fee';

/** @deprecated Use computeServiceFeePence directly. */
export function calculateServiceFee(subtotalPence: number): number {
  return _compute(subtotalPence);
}

/** @deprecated Use computeServiceFeePence directly. */
export function getServiceFeePence(subtotalPence: number): number {
  return _compute(subtotalPence);
}

/**
 * Return the service-fee rate as basis points.
 * Used only to populate `platformServiceFeeBps` on the vendor-profile response
 * for any client that still reads that field. New code calls `computeServiceFeePence`.
 * Falls back to PLATFORM_FACTS when SERVICE_FEE_BPS is unset so the field is
 * never silently 0.
 */
export function getServiceFeeBps(): number {
  const env = Number.parseInt(process.env.SERVICE_FEE_BPS ?? '', 10);
  if (Number.isFinite(env) && env >= 0) return env;
  return PLATFORM_FACTS.serviceFee.percent * 100;
}

/** Kept for any caller that reads the config object directly. */
export const SERVICE_FEE_CONFIG = {
  maxPence: PLATFORM_FACTS.serviceFee.capPence,
} as const;

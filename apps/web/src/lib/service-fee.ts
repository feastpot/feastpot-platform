/**
 * Service-fee helpers for the web app.
 *
 * The canonical formula is in packages/config/src/service-fee.ts.
 * `computeServiceFeePence` is re-exported here so Next.js components
 * import from a short local alias rather than a deep package path.
 *
 * `calcServiceFeePence` is kept for back-compat; it now ignores the legacy
 * `bps` parameter (which was read from the vendor profile and was always
 * equal to PLATFORM_FACTS.serviceFee.percent × 100) and delegates to the
 * canonical function. The BPS parameter is retained in the signature to
 * avoid breaking callers during the transition; it is stripped on the next
 * clean-up pass once all call sites are updated.
 *
 * UK DMCC Act 2024: the fee must be disclosed at first price display.
 * Import `computeServiceFeePence` and show it wherever an item price or
 * basket subtotal is shown for the first time.
 */
import { computeServiceFeePence } from '@feastpot/config/service-fee';
export { computeServiceFeePence };

/** @deprecated Pass only subtotalPence; bps is ignored. Use computeServiceFeePence. */
export function calcServiceFeePence(
  subtotalPence: number,
  _bps?: number | null | undefined,
): number {
  return computeServiceFeePence(subtotalPence);
}

// Legacy constants retained so any remaining direct imports don't break.
/** @deprecated Not enforced; computeServiceFeePence has no floor. */
export const SERVICE_FEE_MIN_PENCE = 0;
export const SERVICE_FEE_MAX_PENCE = 299;

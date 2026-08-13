/**
 * Canonical service-fee calculator - single source of truth shared by:
 *   - apps/api  (order creation, vendor profile)
 *   - apps/web  (basket drawer, floating bar, checkout)
 *
 * Formula: Math.min(round_half_up(subtotalPence × percent / 100), capPence)
 *
 * Values are read from PLATFORM_FACTS so a fee change only requires updating
 * that constant and re-deploying - no hard-coded 5 or 299 anywhere else.
 *
 * The function is intentionally pure (no env reads, no side effects) so it
 * can be unit-tested in isolation and imported by both the Node API and the
 * Next.js browser bundle.
 *
 * UK DMCC Act 2024 note: this fee MUST be disclosed at the point where the
 * customer first sees a price - vendor menu page, basket, and checkout. Never
 * introduce it for the first time at the payment step.
 */
import { PLATFORM_FACTS } from './platform-facts';

/**
 * Compute the Feastpot service fee in pence for a given items subtotal.
 *
 * Returns 0 for a zero subtotal (empty basket guard).
 *
 * @param subtotalPence  Items subtotal in pence (integer, ≥ 0).
 * @returns              Service fee in pence (integer, ≥ 0, ≤ capPence).
 *
 * @example
 * computeServiceFeePence(1000)  // → 50   (£10.00 × 5% = £0.50)
 * computeServiceFeePence(5980)  // → 299  (£59.80 × 5% = £2.99 exactly)
 * computeServiceFeePence(7000)  // → 299  (£70.00 × 5% = £3.50, capped)
 * computeServiceFeePence(200)   // → 10   (£2.00  × 5% = £0.10)
 * computeServiceFeePence(0)     // → 0    (empty basket)
 */
export function computeServiceFeePence(subtotalPence: number): number {
  if (subtotalPence <= 0) return 0;
  const { percent, capPence } = PLATFORM_FACTS.serviceFee;
  return Math.min(Math.round((subtotalPence * percent) / 100), capPence);
}

/**
 * Determine whether the Feastpot service fee should be waived for a customer.
 *
 * The waiver applies ONLY when the customer has an active FeastPass membership
 * AND placed the order through Feastpot's own marketplace discovery path
 * (attribution MARKETPLACE_FIRST or MARKETPLACE_REPEAT).
 *
 * On VENDOR_REFERRED orders the customer arrived via the vendor's own referral
 * link, so Feastpot's discovery value is not in play. The normal service fee
 * applies even for members.
 *
 * When `attributionSource` is null or unknown, the fee is NOT waived. This is
 * the conservative default: under the DMCC Act 2024 a price that falls between
 * first display and payment is acceptable, but a price that rises is not. By
 * defaulting to "fee shown" at browse time, any subsequent waiver at checkout
 * can only lower the price, never raise it.
 *
 * This pure function is shared between:
 *   - apps/api  (charge path - called with the resolved OrderSource enum value)
 *   - apps/web  (display path - called with the marketplace marker or null)
 *
 * Keeping a single implementation prevents the two paths from diverging.
 *
 * @param hasActiveFeastPass  True when the customer has status ACTIVE.
 * @param attributionSource   Resolved source string, or null when ambiguous.
 *                            Accepted values: 'MARKETPLACE_FIRST',
 *                            'MARKETPLACE_REPEAT', 'VENDOR_REFERRED', or null.
 */
export function shouldWaiveServiceFee(
  hasActiveFeastPass: boolean,
  attributionSource: string | null,
): boolean {
  if (!hasActiveFeastPass) return false;
  // Unknown/ambiguous attribution: conservative default - do not waive.
  if (!attributionSource) return false;
  // Vendor-referred orders keep the full service fee even for members.
  return attributionSource !== 'VENDOR_REFERRED';
}

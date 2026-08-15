import type { FeastPassSavingsPotential } from './api/feastpass';

/**
 * Determines whether to show the FeastPass upsell callout on the order
 * confirmation page.
 *
 * Rules:
 * - `savings` must be fully loaded (not undefined / still fetching / errored)
 * - `savingsPotentialPence` must be > 0 - the API returns 0 for active
 *   members, so a zero value is the server's positive membership signal
 * - The order itself must have charged a non-zero service fee
 *
 * Returning `false` for loading / error / active-member states prevents a
 * flash of the callout before we know whether the customer has a subscription.
 */
export function shouldShowFeastPassCallout(
  serviceFeePence: number,
  savings: FeastPassSavingsPotential | undefined,
): boolean {
  if (serviceFeePence <= 0) return false;
  // Require a positively-loaded response (undefined = loading or error)
  if (savings === undefined) return false;
  // The API returns 0 for active members - suppress the callout
  if (savings.savingsPotentialPence === 0) return false;
  return true;
}

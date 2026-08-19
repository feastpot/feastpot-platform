/**
 * Shared ratio formatter for admin percentage displays.
 *
 * Returns "No data yet" when denominator is zero to prevent misleading
 * 100% / NaN / Infinity values on empty or new datasets (e.g. "100.0%
 * renewal rate" when there are zero FeastPass cohort members).
 *
 * @param numerator   The top-of-fraction value.
 * @param denominator The bottom-of-fraction value. Must be > 0 to produce a
 *                    percentage; zero returns the sentinel string.
 * @param decimals    Decimal places in the formatted string (default 1).
 */
export function formatRatio(numerator: number, denominator: number, decimals = 1): string {
  if (denominator === 0) return 'No data yet';
  return `${((numerator / denominator) * 100).toFixed(decimals)}%`;
}

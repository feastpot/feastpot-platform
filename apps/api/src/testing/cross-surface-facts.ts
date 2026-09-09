/**
 * Utilities for assertions that compare a policy value returned by the four
 * product surfaces.  Keep this independent of Jest so API integration tests
 * and browser-contract tests can share the same failure wording.
 */

export const CROSS_SURFACE_NAMES = [
  'customer site',
  'vendor portal',
  'admin console',
  'API',
] as const;

export type CrossSurfaceName = (typeof CROSS_SURFACE_NAMES)[number];

export type FactSnapshot<T> = Readonly<Record<CrossSurfaceName, T>>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Throws a source-specific error at the first disagreement.  Comparing the
 * normalised values rather than their display strings means this also protects
 * structured facts, including requirements, cancellation tiers, and allergens.
 */
export function assertCrossSurfaceFact<T>(fact: string, snapshots: FactSnapshot<T>): void {
  const baselineSource = CROSS_SURFACE_NAMES[0];
  const baseline = stableJson(snapshots[baselineSource]);

  for (const source of CROSS_SURFACE_NAMES.slice(1)) {
    if (stableJson(snapshots[source]) !== baseline) {
      throw new Error(
        `Cross-surface fact drift for "${fact}": ${baselineSource} disagrees with ${source}.`,
      );
    }
  }
}

/** Assert the whole fact set while retaining the fact name in the error. */
export function assertCrossSurfaceFacts(
  facts: Readonly<Record<string, FactSnapshot<unknown>>>,
): void {
  for (const [fact, snapshots] of Object.entries(facts)) {
    assertCrossSurfaceFact(fact, snapshots);
  }
}

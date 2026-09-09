export type PlatformFactSource = 'customer site' | 'vendor portal' | 'admin console' | 'API';

export type SourceFacts = Record<PlatformFactSource, unknown>;

function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalise(entry)]),
    );
  }
  return typeof value === 'string' ? value.trim() : value;
}

export function assertPlatformFactsAgree(sources: SourceFacts): void {
  const names = Object.keys(sources) as PlatformFactSource[];
  for (let leftIndex = 0; leftIndex < names.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < names.length; rightIndex += 1) {
      const left = names[leftIndex]!;
      const right = names[rightIndex]!;
      if (JSON.stringify(normalise(sources[left])) !== JSON.stringify(normalise(sources[right]))) {
        throw new Error(`Platform facts disagree: ${left} and ${right}.`);
      }
    }
  }
}

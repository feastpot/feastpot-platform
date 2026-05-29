import { CheckCircle2, MapPin, TriangleAlert } from 'lucide-react';

import { evaluateDeliveryCoverage } from '@/lib/api/coverage';

/**
 * Delivery coverage badge. Renders one of three states from a pre-computed
 * distance (the API already returns a haversine distance for the profile +
 * checkout flows) and the vendor's local delivery radius:
 *
 *  - grey   "Enter your postcode to check delivery"  (no postcode yet)
 *  - green  "Delivers to you · X.X miles"            (within radius)
 *  - amber  "Outside delivery area · X.X miles"      (beyond radius)
 *
 * When a postcode IS known but we still can't compute a verdict (vendor hasn't
 * set a service area, or geocoding failed) the badge renders nothing rather
 * than guess - silence beats a misleading claim.
 */
interface Props {
  distanceMiles: number | null | undefined;
  radiusMiles: number | null | undefined;
  hasPostcode: boolean;
  className?: string;
}

export function CoverageBadge({ distanceMiles, radiusMiles, hasPostcode, className }: Props) {
  const verdict = evaluateDeliveryCoverage(distanceMiles, radiusMiles);

  if (verdict.state === 'unknown') {
    if (hasPostcode) return null;
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-cream-deep bg-cream px-3 py-1 text-[11px] font-bold text-charcoal-mid ${className ?? ''}`}
      >
        <MapPin className="h-3.5 w-3.5" aria-hidden />
        Enter your postcode to check delivery
      </span>
    );
  }

  if (verdict.state === 'covered') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-brand bg-brand-light px-3 py-1 text-[11px] font-bold text-brand-dark ${className ?? ''}`}
      >
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        Delivers to you · {verdict.distanceMiles.toFixed(1)} miles
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-plantain bg-plantain/15 px-3 py-1 text-[11px] font-bold text-charcoal ${className ?? ''}`}
    >
      <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      Outside delivery area · {verdict.distanceMiles.toFixed(1)} miles
    </span>
  );
}

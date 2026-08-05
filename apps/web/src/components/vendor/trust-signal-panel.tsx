import { ShieldCheck } from 'lucide-react';

import type { VerifiedTrustSignal } from '@/lib/api/vendors';

interface Props {
  signals: VerifiedTrustSignal[];
  /**
   * Numeric FSA hygiene rating supplied by the vendor (1-5).
   * When set alongside a `hygiene_rating` trust signal, the row reads
   * "Food hygiene rating {value}/5" rather than the generic label.
   */
  fsaRating?: number | null;
  /**
   * Published review count from the vendor profile.
   * When > 0, adds a "Verified reviews ({count})" row that does not require
   * a trust signal — the API already gates reviews on delivered orders.
   */
  ratingCount?: number;
}

type TrustSignalType =
  | 'food_business_registration'
  | 'hygiene_rating'
  | 'identity_check'
  | 'allergen_information'
  | 'delivery_coverage'
  | 'event_catering_experience'
  | 'reliable_orders';

/**
 * "Why customers order with confidence" panel on the vendor profile.
 *
 * Renders one row per signal, strictly in the order the brief specifies.
 * Each row only appears when the backing field is both present AND truthy.
 * Makes no blanket claims ("fully verified") — the honest-framing line at
 * the bottom scopes every row to what this vendor has actually supplied.
 */
export function TrustSignalPanel({ signals, fsaRating, ratingCount }: Props) {
  const hasSignal = (type: TrustSignalType) => signals.some((s) => s.signalType === type);

  // Ordered exactly as the brief specifies; each row suppressed when the
  // backing field is absent or false.
  const rows: Array<{ id: string; label: string; show: boolean }> = [
    {
      id: 'food_business_registration',
      label: 'Food business registration checked',
      show: hasSignal('food_business_registration'),
    },
    {
      id: 'hygiene_rating',
      label:
        typeof fsaRating === 'number' && fsaRating > 0
          ? `Food hygiene rating ${fsaRating}/5`
          : 'Food hygiene rating on file',
      show: hasSignal('hygiene_rating'),
    },
    {
      id: 'identity_check',
      label: 'Identity checked',
      show: hasSignal('identity_check'),
    },
    {
      id: 'allergen_information',
      label: 'Allergen information completed',
      show: hasSignal('allergen_information'),
    },
    // "Typical order acceptance time" — no schema field exists yet.
    // Logged in docs/DEFECT-LOG.md as DEF-017.
    {
      id: 'delivery_coverage',
      label: 'Delivery coverage confirmed for your postcode',
      show: hasSignal('delivery_coverage'),
    },
    {
      id: 'verified_reviews',
      label: `Verified reviews (${ratingCount ?? 0})`,
      // Not a trust-signal row — backed by the API-enforced delivered-order
      // gate on reviews. Shown only when at least one review exists.
      show: typeof ratingCount === 'number' && ratingCount > 0,
    },
  ];

  const visible = rows.filter((r) => r.show);
  if (visible.length === 0) return null;

  return (
    <section
      aria-labelledby="trust-signals-heading"
      className="rounded-2xl border border-brand/15 bg-white p-4 shadow-sm"
    >
      <h2 id="trust-signals-heading" className="text-sm font-black text-charcoal">
        Why customers order with confidence
      </h2>

      <ul className="mt-3 space-y-2">
        {visible.map((row) => (
          <li
            key={row.id}
            className="flex items-center gap-2 text-[13px] font-medium text-charcoal"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-brand" aria-hidden strokeWidth={2.25} />
            {row.label}
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-cream-deep pt-3 text-[11px] font-medium leading-relaxed text-charcoal-mid">
        This vendor displays profile checks, order information, allergen notes and food hygiene
        evidence where available.
      </p>
    </section>
  );
}

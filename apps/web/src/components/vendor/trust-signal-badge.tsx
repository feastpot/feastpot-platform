import { ShieldCheck } from 'lucide-react';

import type { TrustSignalType, VerifiedTrustSignal } from '@/lib/api/vendors';

/**
 * T1 - exact label map from the brief. Only verified signals ever reach
 * this component, and it double-checks by rendering nothing for unknown
 * signal types.
 */
export const TRUST_SIGNAL_LABELS: Record<TrustSignalType, string> = {
  food_business_registration: 'Food business registration checked',
  hygiene_rating: 'Hygiene rating available',
  identity_check: 'Identity checked',
  allergen_information: 'Allergen information complete',
  delivery_coverage: 'Delivery coverage confirmed',
  event_catering_experience: 'Event catering experience',
  reliable_orders: 'Reliable orders',
};

/**
 * Priority order for card surfaces (T3): reliable_orders first, then
 * event_catering_experience, then the rest alphabetically.
 */
export function orderTrustSignalsForCards(
  signals: VerifiedTrustSignal[] | undefined,
): TrustSignalType[] {
  if (!signals?.length) return [];
  const types = signals
    .map((s) => s.signalType)
    .filter((t): t is TrustSignalType => t in TRUST_SIGNAL_LABELS);
  const priority: TrustSignalType[] = ['reliable_orders', 'event_catering_experience'];
  const head = priority.filter((p) => types.includes(p));
  const tail = types.filter((t) => !priority.includes(t)).sort();
  return [...head, ...tail];
}

interface Props {
  signalType: TrustSignalType;
  label: string;
}

/**
 * Compact verified-trust pill. Mirrors the shared Badge styling (rounded
 * pill, semibold) at 12px, in the theme green trust tokens already used by
 * the FSA pill. Renders nothing when handed a signal type outside the
 * verified label map - the caller must only pass verified signals, and this
 * guard makes an unverified/unknown value fail silent rather than fabricate
 * a claim.
 */
export function TrustSignalBadge({ signalType, label }: Props) {
  if (!(signalType in TRUST_SIGNAL_LABELS)) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-transparent bg-brand-light px-2.5 py-0.5 text-xs font-semibold text-brand-dark">
      <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

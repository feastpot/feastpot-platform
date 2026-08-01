import type { VerifiedTrustSignal } from '@/lib/api/vendors';

import { TRUST_SIGNAL_LABELS, TrustSignalBadge } from './trust-signal-badge';

interface Props {
  signals: VerifiedTrustSignal[];
}

/**
 * T2 — "What we have checked" panel on the vendor profile, directly below
 * the vendor header. Lists ONLY this vendor's verified signals; renders
 * null when there are none. Deliberately makes no claim about vendors in
 * general — the copy is scoped to what has been checked for THIS vendor.
 */
export function TrustSignalPanel({ signals }: Props) {
  const verified = signals.filter((s) => s.signalType in TRUST_SIGNAL_LABELS);
  if (verified.length === 0) return null;

  return (
    <section
      aria-labelledby="trust-signals-heading"
      className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm"
    >
      <h2 id="trust-signals-heading" className="text-sm font-bold text-charcoal">
        What we have checked
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {verified.map((s) => (
          <li key={s.signalType}>
            <TrustSignalBadge signalType={s.signalType} label={TRUST_SIGNAL_LABELS[s.signalType]} />
          </li>
        ))}
      </ul>
    </section>
  );
}

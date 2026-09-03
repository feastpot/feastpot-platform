import * as React from 'react';

/**
 * Layer 2 of the three-layer legal presentation.
 *
 * Renders the canonical Rate Schedule (Annex A) as a scannable table,
 * grouping entries by status:
 *   LIVE           – rates currently used in calculations (green badge)
 *   PLANNED        – announced but not yet in force (amber badge)
 *   INCENTIVE      – time-limited promotional rates (purple badge)
 *   CUSTOMER_SIDE  – customer-facing charges, never deducted from vendor payout (grey badge)
 *   OPTIONAL_ADDON – optional paid add-ons (blue badge)
 *
 * All rate data is fetched by the consumer from GET /v1/terms/rate-schedule
 * (public, no auth). This component is props-only so it works in any React
 * context (RSC, client component, SSR).
 *
 * Accessibility: table has appropriate headers and scope; status badges use
 * colour + text (not colour alone) to convey meaning (WCAG 1.4.1).
 */

export type RateStatusValue = 'LIVE' | 'PLANNED' | 'INCENTIVE' | 'CUSTOMER_SIDE' | 'OPTIONAL_ADDON';

export interface RateRow {
  key: string;
  label: string;
  /** Human-readable display string supplied by the canonical schedule endpoint. */
  rateDisplay: string;
  /** Numeric rate for calculation context, or null for non-percentage entries. */
  rateValue: number | null;
  /** What the rate is applied to, e.g. "Food subtotal only". */
  basis: string;
  vatNote: string;
  status: RateStatusValue;
  sortOrder: number;
}

interface RateCardProps {
  rates: RateRow[];
  /** Show a loading skeleton instead of the table. */
  loading?: boolean;
  /** Error message to show instead of the table. */
  error?: string;
  /** Tailwind class(es) to add to the outer wrapper. */
  className?: string;
}

const STATUS_META: Record<RateStatusValue, { label: string; badgeCls: string; dotCls: string }> = {
  LIVE: { label: 'Live', badgeCls: 'bg-green-100 text-green-800', dotCls: 'bg-green-500' },
  PLANNED: { label: 'Planned', badgeCls: 'bg-amber-100 text-amber-800', dotCls: 'bg-amber-400' },
  INCENTIVE: {
    label: 'Promotional',
    badgeCls: 'bg-purple-100 text-purple-800',
    dotCls: 'bg-purple-400',
  },
  CUSTOMER_SIDE: {
    label: 'Customer-side',
    badgeCls: 'bg-neutral-100 text-neutral-600',
    dotCls: 'bg-neutral-400',
  },
  OPTIONAL_ADDON: {
    label: 'Optional',
    badgeCls: 'bg-blue-100 text-blue-800',
    dotCls: 'bg-blue-400',
  },
};

const SECTION_ORDER: RateStatusValue[] = [
  'LIVE',
  'PLANNED',
  'INCENTIVE',
  'CUSTOMER_SIDE',
  'OPTIONAL_ADDON',
];

const SECTION_HEADINGS: Record<RateStatusValue, string> = {
  LIVE: 'Current rates',
  PLANNED: 'Planned changes (not yet in force)',
  INCENTIVE: 'Promotional rates',
  CUSTOMER_SIDE: 'Customer-facing charges (not deducted from your payout)',
  OPTIONAL_ADDON: 'Optional add-ons',
};

function StatusBadge({ status }: { status: RateStatusValue }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.badgeCls}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${m.dotCls}`} />
      {m.label}
    </span>
  );
}

export function RateCard({ rates, loading, error, className = '' }: RateCardProps) {
  const grouped = SECTION_ORDER.reduce<Record<RateStatusValue, RateRow[]>>(
    (acc, status) => {
      acc[status] = rates
        .filter((r) => r.status === status)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      return acc;
    },
    { LIVE: [], PLANNED: [], INCENTIVE: [], CUSTOMER_SIDE: [], OPTIONAL_ADDON: [] },
  );

  return (
    <section
      aria-label="Commission Rate Schedule (Annex A)"
      className={`rounded-2xl border border-neutral-200 bg-white p-5 ${className}`}
    >
      <h3 className="mb-1 text-[13px] font-black uppercase tracking-[0.1em] text-neutral-600">
        Rate Schedule (Annex A)
      </h3>
      <p className="mb-4 text-[12px] text-neutral-500">
        All rates apply to the food subtotal only, never to delivery fees, service charges, or tips.
      </p>

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading rates">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-8 animate-pulse rounded-lg bg-neutral-100" />
          ))}
        </div>
      )}

      {error && !loading && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="space-y-5">
          {SECTION_ORDER.map((status) => {
            const rows = grouped[status];
            if (rows.length === 0) return null;
            return (
              <div key={status}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  {SECTION_HEADINGS[status]}
                </p>
                <table className="w-full text-sm" aria-label={SECTION_HEADINGS[status]}>
                  <caption className="sr-only">{SECTION_HEADINGS[status]}</caption>
                  <thead>
                    <tr className="border-b border-neutral-100">
                      <th
                        scope="col"
                        className="py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500"
                      >
                        Segment
                      </th>
                      <th
                        scope="col"
                        className="py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-neutral-500"
                      >
                        Rate
                      </th>
                      <th
                        scope="col"
                        className="py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-neutral-500"
                      >
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-b border-neutral-50 last:border-0">
                        <td className="py-2.5 text-[13px] text-neutral-800">{r.label}</td>
                        <td className="py-2.5 text-right text-[14px] font-bold text-neutral-900">
                          {r.rateDisplay}
                        </td>
                        <td className="py-2.5 text-right">
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          {rates.length === 0 && (
            <p className="text-[13px] text-neutral-500">No rate information available.</p>
          )}
        </div>
      )}

      <p className="mt-4 text-[11px] text-neutral-400">
        <strong className="font-semibold">Commission and fee changes</strong> require at least 30
        days written notice and are never applied retrospectively.{' '}
        <strong className="font-semibold">General terms changes</strong> require at least 15 days
        notice under the UK P2B Regulation (clause 10). Planned changes appear in the table above
        before they take effect.
      </p>
    </section>
  );
}

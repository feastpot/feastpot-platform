import * as React from 'react';

/**
 * Layer 2 of the three-layer legal presentation.
 *
 * Renders the commission rate schedule as a scannable table, distinguishing
 * live rates from planned (future) rates. Data is passed as props so each
 * consumer fetches from the appropriate API endpoint.
 *
 * P2B Regulation requires rate information to be available "at all stages
 * including before contracting", which is why this component renders on the
 * public become-a-vendor page without authentication.
 *
 * Accessibility: table has appropriate headers and scope; status badges use
 * colour + text (not colour alone) to convey meaning (WCAG 1.4.1).
 */

export interface RateRow {
  /** Human-readable segment name, e.g. "Marketplace - first order". */
  segment: string;
  /** Numeric rate percentage, e.g. 12. */
  ratePercent: number;
  /** 'live' = currently active; 'planned' = not yet in force. */
  status: 'live' | 'planned';
  /** ISO date string for when this rate takes or took effect. */
  effectiveFrom: string;
  /** ISO date string for when this rate ends, or null if open-ended. */
  effectiveTo: string | null;
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function RateCard({ rates, loading, error, className = '' }: RateCardProps) {
  const live = rates.filter((r) => r.status === 'live');
  const planned = rates.filter((r) => r.status === 'planned');

  return (
    <section
      aria-label="Commission Rate Schedule (Annex A)"
      className={`rounded-2xl border border-neutral-200 bg-white p-5 ${className}`}
    >
      <h3 className="mb-1 text-[13px] font-black uppercase tracking-[0.1em] text-neutral-600">
        Rate Schedule (Annex A)
      </h3>
      <p className="mb-4 text-[12px] text-neutral-500">
        Commission is charged on the food subtotal of completed orders only.
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
        <>
          {/* Live rates */}
          {live.length > 0 && (
            <div className="mb-4">
              <table className="w-full text-sm" aria-label="Current live rates">
                <caption className="sr-only">Current commission rates</caption>
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
                  {live.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-50 last:border-0">
                      <td className="py-2.5 text-[13px] text-neutral-800">{r.segment}</td>
                      <td className="py-2.5 text-right text-[14px] font-bold text-neutral-900">
                        {r.ratePercent}%
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Live
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Planned rates */}
          {planned.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Planned changes (not yet in force)
              </p>
              <table className="w-full text-sm" aria-label="Planned future rate changes">
                <caption className="sr-only">Planned future commission rates</caption>
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
                      Effective
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {planned.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-50 last:border-0">
                      <td className="py-2.5 text-[13px] text-neutral-600">{r.segment}</td>
                      <td className="py-2.5 text-right text-[14px] font-bold text-neutral-700">
                        {r.ratePercent}%
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          {formatDate(r.effectiveFrom)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {live.length === 0 && planned.length === 0 && (
            <p className="text-[13px] text-neutral-500">No rate information available.</p>
          )}
        </>
      )}

      <p className="mt-4 text-[11px] text-neutral-400">
        Rates may change with at least 15 days notice (UK P2B Regulation). Changes are
        shown in the Planned section above before they take effect.
      </p>
    </section>
  );
}

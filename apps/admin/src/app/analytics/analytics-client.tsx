'use client';

import { useCallback, useEffect, useState } from 'react';

import { useApi } from '@/hooks/use-api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.feastpot.co.uk';

// ── Data shapes ───────────────────────────────────────────────────────────────

interface FunnelStat {
  eventName: string;
  uniqueSessions: number;
  totalEvents: number;
}

interface ShareActivityRow {
  vendorId: string;
  businessName: string;
  linkClicks: number;
  qrScans: number;
}

interface AttributionBreakdownRow {
  attributionSource: string;
  count: number;
  firstOrders: number;
  repeatOrders: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FUNNEL_ORDER = [
  'vendor_page_view',
  'calculator_interaction',
  'application_start',
  'application_complete',
  'share_link_click',
  'qr_scan',
];

function sortFunnel(rows: FunnelStat[]): FunnelStat[] {
  return [...rows].sort((a, b) => {
    const ia = FUNNEL_ORDER.indexOf(a.eventName);
    const ib = FUNNEL_ORDER.indexOf(b.eventName);
    if (ia === -1 && ib === -1) return a.eventName.localeCompare(b.eventName);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

const SOURCE_LABELS: Record<string, string> = {
  VENDOR_REFERRED: 'Vendor referred',
  MARKETPLACE: 'Marketplace',
  MARKETPLACE_REPEAT: 'Marketplace (repeat)',
};

const EVENT_LABELS: Record<string, string> = {
  vendor_page_view: 'Page view',
  calculator_interaction: 'Calculator used',
  application_start: 'Application started',
  application_complete: 'Application submitted',
  share_link_click: 'Share link copied',
  qr_scan: 'QR scanned',
};

function pct(n: number, of: number) {
  if (!of) return 'No data yet';
  return `${((n / of) * 100).toFixed(1)}%`;
}

// ── QR backfill card ──────────────────────────────────────────────────────────

interface BackfillResult {
  processed: number;
  failed: number;
  dryRun: boolean;
  slugs?: string[];
}

function QrBackfillCard({ token }: { token: string | null }) {
  const [busy, setBusy] = useState<false | 'dry' | 'live'>(false);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    setBusy(dryRun ? 'dry' : 'live');
    setErr(null);
    setResult(null);
    try {
      const res = await fetch(
        `${API_URL}/v1/attribution/admin/backfill-qr-markers?dryRun=${String(dryRun)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token ?? ''}` },
        },
      );
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setResult((await res.json()) as BackfillResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-white p-5">
      <h2 className="mb-1 text-sm font-bold text-dark">QR code backfill</h2>
      <p className="mb-4 text-sm text-mid">
        Regenerate stored QR codes to include the{' '}
        <code className="rounded bg-surface px-1 text-xs">?m=qr</code> tracking marker. Only affects
        QRs generated before this feature was added. Run dry-run first to preview the scope.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run(true)}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-dark hover:bg-muted disabled:opacity-50"
        >
          {busy === 'dry' ? 'Scanning...' : 'Dry run'}
        </button>
        {result?.dryRun && result.processed > 0 && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run(false)}
            className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50"
          >
            {busy === 'live'
              ? 'Regenerating...'
              : `Regenerate ${result.processed} QR${result.processed === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
      {result && (
        <div className="mt-4 rounded-lg bg-surface p-3 text-sm">
          {result.dryRun ? (
            <p>
              Dry run: <strong>{result.processed}</strong> QR{result.processed === 1 ? '' : 's'}{' '}
              would be regenerated.
            </p>
          ) : (
            <p>
              Done: <strong>{result.processed}</strong> regenerated,{' '}
              <strong>{result.failed}</strong> failed.
            </p>
          )}
          {result.slugs && result.slugs.length > 0 && (
            <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-mid">
              {result.slugs.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
    </section>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

const DAYS_OPTIONS = [7, 30, 90] as const;
type Days = (typeof DAYS_OPTIONS)[number];

export function AnalyticsClient({
  role,
  accessToken,
}: {
  role: string;
  accessToken: string | null;
}) {
  const { request, ready } = useApi();
  const [days, setDays] = useState<Days>(30);

  const [funnel, setFunnel] = useState<FunnelStat[] | null>(null);
  const [shares, setShares] = useState<ShareActivityRow[] | null>(null);
  const [attribution, setAttribution] = useState<AttributionBreakdownRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    async (d: Days) => {
      if (!ready) return;
      setLoading(true);
      setErr(null);
      try {
        const [f, s, a] = await Promise.all([
          request<FunnelStat[]>(`/analytics/admin/funnel?days=${d}`),
          request<ShareActivityRow[]>(`/analytics/admin/shares?days=${d}&limit=20`),
          request<AttributionBreakdownRow[]>(`/analytics/admin/attribution?days=${d}`),
        ]);
        setFunnel(f);
        setShares(s);
        setAttribution(a);
      } catch {
        setErr('Failed to load analytics data. Try refreshing the page.');
      } finally {
        setLoading(false);
      }
    },
    [request, ready],
  );

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const pageViewSessions =
    funnel?.find((r) => r.eventName === 'vendor_page_view')?.uniqueSessions ?? 0;
  const sortedFunnel = funnel ? sortFunnel(funnel) : [];

  return (
    <div className="space-y-8">
      {/* Date range selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-mid">Period:</span>
        {DAYS_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={[
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              days === d
                ? 'bg-teal text-white'
                : 'border border-border bg-white text-dark hover:bg-surface',
            ].join(' ')}
          >
            {d}d
          </button>
        ))}
        {loading && <span className="ml-2 text-xs text-mid">Loading...</span>}
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Funnel table */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-mid">
          Acquisition funnel - last {days} days
        </h2>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-4 py-3 text-left font-semibold text-mid">Step</th>
                <th className="px-4 py-3 text-right font-semibold text-mid">Unique sessions</th>
                <th className="px-4 py-3 text-right font-semibold text-mid">Total events</th>
                <th className="px-4 py-3 text-right font-semibold text-mid">
                  % of page-view sessions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedFunnel.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-mid">
                    No data for this period.
                  </td>
                </tr>
              )}
              {sortedFunnel.map((row, i) => (
                <tr key={row.eventName} className={i % 2 === 0 ? 'bg-white' : 'bg-surface/50'}>
                  <td className="px-4 py-3 font-medium text-dark">
                    {EVENT_LABELS[row.eventName] ?? row.eventName}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-dark">
                    {row.uniqueSessions.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-dark">
                    {row.totalEvents.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-mid">
                    {row.eventName === 'vendor_page_view'
                      ? pct(row.uniqueSessions, pageViewSessions)
                      : pct(row.uniqueSessions, pageViewSessions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-mid">
          "% of page-view sessions" compares each step&apos;s unique sessions against the
          vendor_page_view unique session count. Share/QR events can exceed 100% if users interact
          multiple times across sessions. "No data yet" means no page-view sessions were recorded in
          this period. "Unique sessions" uses the anonymous visitor ID stored in the user&apos;s
          browser; visitors without localStorage return as separate sessions.
        </p>
      </section>

      {/* Attribution source breakdown */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-mid">
          Order attribution - last {days} days
        </h2>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-4 py-3 text-left font-semibold text-mid">Source</th>
                <th className="px-4 py-3 text-right font-semibold text-mid">Orders</th>
                <th className="px-4 py-3 text-right font-semibold text-mid">First-time</th>
                <th className="px-4 py-3 text-right font-semibold text-mid">Repeat</th>
              </tr>
            </thead>
            <tbody>
              {(!attribution || attribution.length === 0) && !loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-mid">
                    No orders recorded in this period.
                  </td>
                </tr>
              )}
              {(attribution ?? []).map((row, i) => (
                <tr
                  key={row.attributionSource}
                  className={i % 2 === 0 ? 'bg-white' : 'bg-surface/50'}
                >
                  <td className="px-4 py-3 font-medium text-dark">
                    {SOURCE_LABELS[row.attributionSource] ?? row.attributionSource}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-dark">
                    {row.count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-dark">
                    {row.firstOrders.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-dark">
                    {row.repeatOrders.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Share activity table */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-mid">
          Top vendors by share activity - last {days} days
        </h2>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-4 py-3 text-left font-semibold text-mid">Vendor</th>
                <th className="px-4 py-3 text-right font-semibold text-mid">Link copies</th>
                <th className="px-4 py-3 text-right font-semibold text-mid">QR scans</th>
                <th className="px-4 py-3 text-right font-semibold text-mid">Total</th>
              </tr>
            </thead>
            <tbody>
              {(!shares || shares.length === 0) && !loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-mid">
                    No share activity in this period.
                  </td>
                </tr>
              )}
              {(shares ?? []).map((row, i) => (
                <tr key={row.vendorId} className={i % 2 === 0 ? 'bg-white' : 'bg-surface/50'}>
                  <td className="px-4 py-3 font-medium text-dark">{row.businessName}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-dark">
                    {row.linkClicks.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-dark">
                    {row.qrScans.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-dark">
                    {(row.linkClicks + row.qrScans).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-mid">
          QR scans are only tracked for codes generated after the &amp;m=qr marker was introduced.
          Use the backfill tool below to regenerate older QR codes.
        </p>
      </section>

      {/* QR backfill - visible to admin only */}
      {role === 'admin' && <QrBackfillCard token={accessToken} />}
    </div>
  );
}

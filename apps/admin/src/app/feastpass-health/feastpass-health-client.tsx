'use client';

import { useEffect, useState } from 'react';

import { formatRatio } from '@/lib/format-ratio';

interface HealthStats {
  activeCount: number;
  pastDueCount: number;
  cancelledThisMonth: number;
  totalMembers: number;
  renewalRate: number;
  churnRate: number;
  cohortCancelledCount: number;
  cohortStartedCount: number;
  totalSavedPence: number;
  totalSavingsOrders: number;
  avgSavingPerMemberPence: number;
  memberOrdersLast30d: number;
  nonMemberOrdersLast30d: number;
  belowRenewalThreshold: boolean;
  estimatedMonthlyRevenuePence: number;
}

interface Props {
  accessToken: string;
  apiUrl: string;
}

function fmt(p: number) {
  return `£${(p / 100).toFixed(2)}`;
}

/**
 * Formats a pre-computed percentage from the API (already 0-100 scale).
 * When cohortStartedCount is 0 there is no cohort data yet; the API returns
 * renewalRate=100 and churnRate=0 by convention, which is misleading.
 * Pass cohortStarted so we can show "No data yet" instead.
 */
function pctOrNoData(value: number, cohortStarted: number): string {
  return formatRatio(cohortStarted === 0 ? 0 : value, cohortStarted === 0 ? 0 : 100);
}

export function FeastPassHealthClient({ accessToken, apiUrl }: Props) {
  const [stats, setStats] = useState<HealthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/v1/admin/feastpass/health`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<HealthStats>;
      })
      .then(setStats)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [accessToken, apiUrl]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (error || !stats) {
    return <p className="text-sm text-destructive">{error ?? 'Failed to load'}</p>;
  }

  const memberNonMemberTotal = stats.memberOrdersLast30d + stats.nonMemberOrdersLast30d;
  const memberOrderShare =
    memberNonMemberTotal > 0
      ? ((stats.memberOrdersLast30d / memberNonMemberTotal) * 100).toFixed(1)
      : '0';

  return (
    <div className="space-y-6">
      {/* North-star alert */}
      {stats.belowRenewalThreshold && stats.cohortStartedCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="font-semibold text-red-800">Monthly renewal rate below 80%</p>
            <p className="text-sm text-red-700">
              Current: {pctOrNoData(stats.renewalRate, stats.cohortStartedCount)}. Investigate churn
              causes immediately.
            </p>
          </div>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Active members"
          value={String(stats.activeCount)}
          sub={`${stats.pastDueCount} past due`}
          highlight={stats.activeCount > 0}
        />
        <KpiCard
          label="Monthly renewal rate"
          value={pctOrNoData(stats.renewalRate, stats.cohortStartedCount)}
          sub={
            stats.cohortStartedCount === 0
              ? 'no cohort data yet (30–60d window)'
              : 'north-star metric'
          }
          alert={stats.belowRenewalThreshold && stats.cohortStartedCount > 0}
        />
        <KpiCard
          label="Churn (last 30d cohort)"
          value={pctOrNoData(stats.churnRate, stats.cohortStartedCount)}
          sub={`${stats.cohortCancelledCount} of ${stats.cohortStartedCount} subs`}
        />
        <KpiCard
          label="Cancelled this month"
          value={String(stats.cancelledThisMonth)}
          sub="vs previous cohort"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard
          label="Member orders (30d)"
          value={String(stats.memberOrdersLast30d)}
          sub={`${memberOrderShare}% of fee-generating orders`}
        />
        <KpiCard
          label="Avg saving / member"
          value={fmt(stats.avgSavingPerMemberPence)}
          sub="lifetime cumulative"
        />
        <KpiCard
          label="Total fees saved (all time)"
          value={fmt(stats.totalSavedPence)}
          sub={`across ${stats.totalSavingsOrders} orders`}
        />
      </div>

      {/* Revenue contribution */}
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold text-foreground">Revenue contribution</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Estimated monthly subscription revenue:{' '}
          <strong className="text-foreground">{fmt(stats.estimatedMonthlyRevenuePence)}</strong>{' '}
          from {stats.activeCount} active members.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Note: revenue mix (MONTHLY vs ANNUAL) isn't tracked per member yet. This approximates all
          members at the monthly rate. Check Stripe dashboard for exact MRR.
        </p>
      </div>

      {/* Member vs non-member orders */}
      <div className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold text-foreground">
          Orders per member vs non-member (last 30 days)
        </h2>
        <div className="mt-4 space-y-3">
          <Metric
            label="Member orders (fee waived)"
            value={stats.memberOrdersLast30d}
            total={memberNonMemberTotal}
            colour="bg-brand"
          />
          <Metric
            label="Non-member fee-paying orders"
            value={stats.nonMemberOrdersLast30d}
            total={memberNonMemberTotal}
            colour="bg-muted"
          />
        </div>
        {stats.memberOrdersLast30d > 0 && stats.nonMemberOrdersLast30d > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Members placed{' '}
            {stats.activeCount > 0
              ? (stats.memberOrdersLast30d / stats.activeCount).toFixed(1)
              : 'N/A'}{' '}
            orders/member on average in the last 30 days.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Cohort data compares members who started 30–60 days ago. Refresh the page for the latest
        figures.
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  highlight,
  alert,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  alert?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${alert ? 'border-red-200 bg-red-50' : 'bg-card'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-2xl font-bold ${
          alert ? 'text-red-700' : highlight ? 'text-brand' : 'text-foreground'
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Metric({
  label,
  value,
  total,
  colour,
}: {
  label: string;
  value: number;
  total: number;
  colour: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="mt-1.5 h-2 w-full rounded-full bg-muted/30">
        <div className={`h-2 rounded-full ${colour} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

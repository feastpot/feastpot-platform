'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@feastpot/ui';
import { AlertTriangle, ChevronDown, Clock3, UsersRound } from 'lucide-react';
import { useApi } from '@/hooks/use-api';

type FunnelRow = { eventName: string; count: number; dropOffFromPrevious: number | null };
type RecoveryRow = { stage: string; sent: number; recovered: number; rate: number | null };
type Lifecycle = {
  funnel: FunnelRow[];
  applicationStartRate: number;
  monthlySessions: number;
  monthlySessionsCaution: boolean;
  recoveryRates: RecoveryRow[];
  timeToLiveSeconds: { p50: number | null; p90: number | null };
};
type StuckLead = { applicationId: string | null; createdAt: string };

const ORDER = [
  'application_start',
  'application_phase_1_completed',
  'application_submitted',
  'application_approved',
  'vendor_live',
  'first_order',
  'first_payout',
];
const LABELS: Record<string, string> = {
  application_start: 'Application started',
  application_phase_1_completed: 'Application phase 1 completed',
  application_submitted: 'Application submitted',
  application_approved: 'Application approved',
  vendor_live: 'Vendor live',
  first_order: 'First order',
  first_payout: 'First payout',
};
const formatDuration = (seconds: number | null) =>
  seconds === null
    ? '-'
    : seconds < 86_400
      ? `${Math.round(seconds / 3_600)}h`
      : `${Math.round(seconds / 86_400)}d`;

export function VendorAcquisitionClient({ canSeeStuckLeads }: { canSeeStuckLeads: boolean }) {
  const { request, ready } = useApi();
  const [days, setDays] = useState(30);
  const [expanded, setExpanded] = useState<string | null>(null);
  const lifecycle = useQuery({
    queryKey: ['admin', 'vendor-acquisition', 'lifecycle', days],
    enabled: ready,
    queryFn: () => request<Lifecycle>(`/analytics/admin/lifecycle?days=${days}`),
  });
  const stuck = useQuery({
    queryKey: ['admin', 'vendor-acquisition', 'stuck-leads', days],
    enabled: ready && canSeeStuckLeads,
    queryFn: () => request<StuckLead[]>(`/analytics/admin/stuck-leads?days=${days}`),
  });
  const rows = [...(lifecycle.data?.funnel ?? [])].sort(
    (a, b) =>
      (ORDER.indexOf(a.eventName) < 0 ? 999 : ORDER.indexOf(a.eventName)) -
      (ORDER.indexOf(b.eventName) < 0 ? 999 : ORDER.indexOf(b.eventName)),
  );
  const selected = expanded ? rows.find((row) => row.eventName === expanded) : undefined;
  const selectedNext = expanded
    ? rows[rows.findIndex((row) => row.eventName === expanded) + 1]
    : undefined;
  const recovery =
    selected && selectedNext && selected.count
      ? Math.round((selectedNext.count / selected.count) * 100)
      : null;
  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Window</span>
          {[7, 30, 90].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value)}
              className={`rounded-md border px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${days === value ? 'border-brand bg-brand text-white' : 'border-border bg-card hover:bg-muted'}`}
            >
              {value}d
            </button>
          ))}
        </div>
        {lifecycle.isFetching && (
          <span className="text-xs text-muted-foreground" role="status">
            Updating data…
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <UsersRound className="h-5 w-5 text-brand" />
            <div>
              <p className="text-xs text-muted-foreground">Monthly sessions</p>
              <p className="text-2xl font-bold tabular-nums">
                {(lifecycle.data?.monthlySessions ?? 0).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock3 className="h-5 w-5 text-brand" />
            <div>
              <p className="text-xs text-muted-foreground">Time to live · p50</p>
              <p className="text-2xl font-bold tabular-nums">
                {formatDuration(lifecycle.data?.timeToLiveSeconds.p50 ?? null)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock3 className="h-5 w-5 text-amber-700" />
            <div>
              <p className="text-xs text-muted-foreground">Time to live · p90</p>
              <p className="text-2xl font-bold tabular-nums">
                {formatDuration(lifecycle.data?.timeToLiveSeconds.p90 ?? null)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      {lifecycle.data?.monthlySessionsCaution && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <strong>Read this directionally:</strong>{' '}
          {lifecycle.data.monthlySessions.toLocaleString()} sessions in the last month is a small
          sample; results are directional only. Do not A/B test at this volume.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Application start rate</p>
            <p className="text-2xl font-bold tabular-nums">
              {((lifecycle.data?.applicationStartRate ?? 0) * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">of monthly sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Recovery rates</p>
            <div className="mt-2 space-y-1">
              {(lifecycle.data?.recoveryRates ?? []).length ? (
                lifecycle.data?.recoveryRates.map((rate) => (
                  <div key={rate.stage} className="flex justify-between text-sm">
                    <span>{rate.stage}</span>
                    <span className="tabular-nums">
                      {rate.rate === null ? '-' : `${(rate.rate * 100).toFixed(1)}%`}{' '}
                      <span className="text-xs text-muted-foreground">
                        ({rate.recovered}/{rate.sent})
                      </span>
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  No recovery stages sent in this period.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      {lifecycle.error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          Could not load lifecycle analytics: {(lifecycle.error as Error).message}
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-semibold">Ordered funnel</h2>
            <p className="text-xs text-muted-foreground">
              Select a step to inspect drop-off and recovery into the next milestone.
            </p>
          </div>
          <div className="divide-y divide-border">
            {lifecycle.isLoading && (
              <div className="space-y-3 p-5">
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            )}
            {!lifecycle.isLoading && !rows.length && (
              <p className="p-6 text-sm text-muted-foreground">
                No lifecycle events in this period.
              </p>
            )}
            {rows.map((row, index) => {
              const previous = rows[index - 1];
              const drop =
                row.dropOffFromPrevious !== null
                  ? Math.round((row.dropOffFromPrevious / (previous?.count || row.count)) * 100)
                  : null;
              return (
                <div key={row.eventName}>
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === row.eventName ? null : row.eventName)}
                    aria-expanded={expanded === row.eventName}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="w-6 text-xs tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 font-medium">
                      {LABELS[row.eventName] ?? row.eventName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {drop !== null ? `${drop}% drop` : 'Entry'}
                    </span>
                    <span className="w-16 text-right font-semibold tabular-nums">
                      {row.count.toLocaleString()}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${expanded === row.eventName ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {expanded === row.eventName && (
                    <div className="grid gap-3 bg-muted/30 px-12 py-3 text-sm sm:grid-cols-3">
                      <div>
                        <span className="block text-xs text-muted-foreground">Next step</span>
                        <span className="font-medium">
                          {selectedNext
                            ? (LABELS[selectedNext.eventName] ?? selectedNext.eventName)
                            : 'No later step recorded'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">
                          Recovery to next step
                        </span>
                        <span className="font-semibold">
                          {recovery === null ? '-' : `${recovery}%`}
                        </span>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">Action</span>
                        <Link
                          href={
                            selectedNext
                              ? `/vendor-acquisition?step=${encodeURIComponent(selectedNext.eventName)}`
                              : '#stuck-leads'
                          }
                          className="font-medium text-primary hover:underline"
                        >
                          View stuck leads
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      {canSeeStuckLeads && (
        <Card id="stuck-leads">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <div>
                <h2 className="font-semibold">Stuck leads</h2>
                <p className="text-xs text-muted-foreground">
                  Started an application but have not completed the journey.
                </p>
              </div>
            </div>
            {stuck.error && (
              <p role="alert" className="p-4 text-sm text-destructive">
                Could not load stuck leads: {(stuck.error as Error).message}
              </p>
            )}
            {stuck.isLoading && (
              <p className="p-4 text-sm text-muted-foreground">Loading stuck leads…</p>
            )}
            {!stuck.isLoading && !stuck.error && !stuck.data?.length && (
              <p className="p-5 text-sm text-muted-foreground">No stuck leads in this period.</p>
            )}
            {stuck.data && stuck.data.length > 0 && (
              <div className="divide-y divide-border">
                {stuck.data.map((lead, index) => (
                  <div
                    key={`${lead.applicationId}-${lead.createdAt}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                  >
                    <span className="w-6 text-xs text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {lead.applicationId
                        ? `Application ${lead.applicationId.slice(0, 8)}`
                        : 'Unlinked application'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Started {new Date(lead.createdAt).toLocaleDateString('en-GB')}
                    </span>
                    {lead.applicationId && (
                      <Link
                        href={`/vendor-applications/${lead.applicationId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        Open lead
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

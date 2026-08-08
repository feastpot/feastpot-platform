'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@feastpot/ui';
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toaster';
import { useAdminNotices, useResendNotice, type NoticeRow } from '@/hooks/use-legal';
import { formatDateTime } from '@/lib/format';

function pct(n: number, total: number) {
  if (total === 0) return '-';
  return `${Math.round((n / total) * 100)}%`;
}

function isBounced(n: NoticeRow) {
  return !n.deliveredAt && new Date(n.sentAt) < new Date(Date.now() - 24 * 60 * 60 * 1000);
}

export function NoticesClient() {
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>();
  const { data, isLoading, refetch } = useAdminNotices(selectedVersionId);
  const resend = useResendNotice();
  const { toast } = useToast();
  const [showBounced, setShowBounced] = useState(false);

  const notices = data?.notices ?? [];
  const filteredNotices = showBounced ? notices.filter(isBounced) : notices;
  const totalBounced = notices.filter(isBounced).length;

  function handleResend(noticeId: string) {
    resend.mutate(noticeId, {
      onSuccess: () => {
        toast({ title: 'Queued', description: 'Notice re-enqueued for delivery.' });
        void refetch();
      },
      onError: (err) =>
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Failed to resend',
          variant: 'destructive',
        }),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Notice delivery</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-version delivery statistics. An undelivered notice is arguably not notice at all -
          bounced emails must be resent.
        </p>
      </div>

      {/* Version summary cards */}
      {data?.summary && data.summary.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.summary.map((s) => (
            <button
              key={s.termsVersionId}
              type="button"
              onClick={() =>
                setSelectedVersionId((prev) =>
                  prev === s.termsVersionId ? undefined : s.termsVersionId,
                )
              }
              className={`rounded-lg border p-4 text-left transition-shadow hover:shadow-md ${
                selectedVersionId === s.termsVersionId
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-mono font-semibold text-foreground">v{s.version}</p>
                {s.bounced > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-destructive">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    {s.bounced} bounced
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{s.documentType.replace(/_/g, ' ')}</p>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                {[
                  { label: 'Sent', val: s.sent },
                  { label: 'Delivered', val: s.delivered },
                  { label: 'Opened', val: s.opened },
                  { label: 'Ack.', val: s.acknowledged },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className="text-sm font-bold tabular-nums">{stat.val}</div>
                    <div className="text-[10px] text-muted-foreground">{stat.label}</div>
                    <div className="text-[10px] text-muted-foreground">{pct(stat.val, s.sent)}</div>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {selectedVersionId && (
          <Button size="sm" variant="outline" onClick={() => setSelectedVersionId(undefined)}>
            Clear version filter
          </Button>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showBounced}
            onChange={(e) => setShowBounced(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Show only bounced ({totalBounced})
        </label>
      </div>

      {/* Notice rows */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {showBounced ? `Bounced notices (${filteredNotices.length})` : `All notices (${filteredNotices.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading...</p>
          ) : filteredNotices.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" aria-hidden />
              <p className="text-sm font-semibold text-green-700">
                {showBounced ? 'No bounced notices' : 'No notices found'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pl-4 text-left font-semibold">Vendor</th>
                  <th className="py-2 text-left font-semibold">Version</th>
                  <th className="py-2 text-left font-semibold">Channel</th>
                  <th className="py-2 text-left font-semibold">Sent</th>
                  <th className="py-2 text-left font-semibold">Delivered</th>
                  <th className="py-2 text-left font-semibold">Opened</th>
                  <th className="py-2 text-left font-semibold">Ack.</th>
                  <th className="py-2 pr-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredNotices.map((n) => {
                  const bounced = isBounced(n);
                  return (
                    <tr
                      key={n.id}
                      className={bounced ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-muted/30'}
                    >
                      <td className="py-2.5 pl-4 font-medium">
                        <Link href={`/vendors/${n.vendorId}`} className="hover:underline">
                          {n.vendor.businessName}
                        </Link>
                        {bounced && (
                          <span className="ml-2 inline-flex items-center gap-0.5 text-xs font-semibold text-destructive">
                            <AlertTriangle className="h-3 w-3" aria-hidden /> bounced
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 font-mono text-muted-foreground">
                        v{n.termsVersion.version}
                      </td>
                      <td className="py-2.5">
                        <StatusPill
                          tone={
                            n.channel === 'EMAIL'
                              ? 'info'
                              : n.channel === 'WHATSAPP'
                                ? 'success'
                                : 'neutral'
                          }
                        >
                          {n.channel}
                        </StatusPill>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{formatDateTime(n.sentAt)}</td>
                      <td className="py-2.5">
                        {n.deliveredAt ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Delivered" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" aria-label="Not delivered" />
                        )}
                      </td>
                      <td className="py-2.5">
                        {n.openedAt ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Opened" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {n.acknowledgedAt ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Acknowledged" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        {!n.deliveredAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResend(n.id)}
                            disabled={resend.isPending}
                          >
                            <RefreshCw className="mr-1 h-3 w-3" aria-hidden />
                            Resend
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

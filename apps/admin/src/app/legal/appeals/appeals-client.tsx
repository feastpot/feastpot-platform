'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@feastpot/ui';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import Link from 'next/link';

import { StatusPill } from '@/components/ui/status-pill';
import { useAdminAppealsQueue } from '@/hooks/use-legal';
import { formatDateTime } from '@/lib/format';

function DeadlinePill({ hours, overdue }: { hours: number; overdue: boolean }) {
  if (overdue) return <StatusPill tone="danger">Overdue</StatusPill>;
  if (hours < 24) return <StatusPill tone="danger">&lt;24 h</StatusPill>;
  if (hours < 48) return <StatusPill tone="warning">&lt;48 h</StatusPill>;
  const days = Math.floor(hours / 24);
  return <StatusPill tone="neutral">{days}d remaining</StatusPill>;
}

function formatMoney(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

export function AppealsQueueClient() {
  const { data: appeals, isLoading } = useAdminAppealsQueue();

  const overdue = appeals?.filter((a) => a.overdue).length ?? 0;
  const urgent = appeals?.filter((a) => a.urgent && !a.overdue).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Appeals queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All open appeals (no stage-2 outcome). The different-reviewer rule applies: the stage-2
          reviewer must not be the same person as stage-1.
        </p>
      </div>

      {overdue > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <p className="text-sm font-semibold text-destructive">
            {overdue} appeal{overdue !== 1 ? 's' : ''} past deadline - immediate action required
          </p>
        </div>
      )}
      {urgent > 0 && overdue === 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <p className="text-sm font-semibold text-amber-800">
            {urgent} appeal{urgent !== 1 ? 's' : ''} within 48 hours of deadline
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Open appeals {appeals ? `(${appeals.length})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading...</p>
          ) : !appeals || appeals.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" aria-hidden />
              <p className="text-sm font-semibold text-green-700">No open appeals</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pl-4 text-left font-semibold">Vendor</th>
                  <th className="py-2 text-left font-semibold">Order</th>
                  <th className="py-2 text-left font-semibold">Submitted</th>
                  <th className="py-2 text-left font-semibold">Deadline</th>
                  <th className="py-2 text-left font-semibold">Stage</th>
                  <th className="py-2 text-left font-semibold">Stage 1 reviewer</th>
                  <th className="py-2 text-left font-semibold">Urgent</th>
                  <th className="py-2 pr-4 text-left font-semibold">Dispute</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {appeals.map((a) => (
                  <tr
                    key={a.id}
                    className={
                      a.overdue
                        ? 'bg-red-50 hover:bg-red-100'
                        : a.urgent
                          ? 'bg-amber-50 hover:bg-amber-100'
                          : 'hover:bg-muted/30'
                    }
                  >
                    <td className="py-2.5 pl-4 font-medium">
                      <Link href={`/disputes/${a.disputeId}`} className="hover:underline">
                        {a.vendorName}
                      </Link>
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      <div className="font-mono text-xs">{a.dispute.order.orderNumber}</div>
                      <div className="text-xs">{formatMoney(a.dispute.order.totalPence)}</div>
                    </td>

                    <td className="py-2.5 text-muted-foreground">{formatDateTime(a.submittedAt)}</td>
                    <td className="py-2.5">
                      <DeadlinePill hours={a.hoursToDeadline} overdue={a.overdue} />
                    </td>
                    <td className="py-2.5">
                      {a.stage1Pending ? (
                        <StatusPill tone="warning">Awaiting stage 1</StatusPill>
                      ) : a.stage2Pending ? (
                        <StatusPill tone="info">Stage 1 done, awaiting stage 2</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">Unknown</StatusPill>
                      )}
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {a.stage1By ?? '-'}
                      {a.stage1Outcome && (
                        <span
                          className={`ml-1 text-xs font-semibold ${a.stage1Outcome === 'UPHELD' ? 'text-green-700' : 'text-destructive'}`}
                        >
                          ({a.stage1Outcome})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {a.dispute.isUrgentDispute ? (
                        <StatusPill tone="danger">Yes</StatusPill>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Link
                        href={`/disputes/${a.disputeId}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Open dispute
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-amber-900">Different-reviewer rule (clause 18.3)</p>
          <p className="mt-0.5 text-xs text-amber-800">
            The stage-2 reviewer must not be the same person as the stage-1 reviewer. The API
            enforces this with a <code>SAME_REVIEWER</code> error. When assigning, check the stage-1
            reviewer column above and ensure a different staff member handles stage 2.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

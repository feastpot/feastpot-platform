'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@feastpot/ui';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { StatusPill } from '@/components/ui/status-pill';
import { type StatusTone } from '@/components/ui/status-pill';
import { useAdminEnforcementLog } from '@/hooks/use-legal';
import { REASON_CODE_LABELS } from '@/hooks/use-vendor-enforcement';
import { formatDate, formatDateTime } from '@/lib/format';

const ACTION_TONE: Record<string, StatusTone> = {
  RESTRICTION: 'warning',
  SUSPENSION: 'danger',
  TERMINATION: 'danger',
};

export function EnforcementLogClient() {
  const [actionType, setActionType] = useState<string>('');
  const [liftedAt, setLiftedAt] = useState<'active' | 'all'>('all');
  const { data: actions, isLoading } = useAdminEnforcementLog({
    actionType: actionType || undefined,
    liftedAt,
  });

  const lateCount = actions?.filter((a) => a.noticeLate).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Enforcement log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every restriction, suspension and termination across all vendors. Actions where notice
          followed effect without an urgent basis are flagged - that is the compliance failure mode.
        </p>
      </div>

      {lateCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-destructive">
              {lateCount} action{lateCount !== 1 ? 's' : ''} with notice after effect - no urgent basis recorded
            </p>
            <p className="mt-0.5 text-xs text-red-700">
              P2B clause 14.1 requires written notice before an enforcement action takes effect.
              Actions in rows highlighted in red must be reviewed.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value)}
          className="fp-admin-input"
        >
          <option value="">All action types</option>
          <option value="RESTRICTION">Restriction</option>
          <option value="SUSPENSION">Suspension</option>
          <option value="TERMINATION">Termination</option>
        </select>
        <select
          value={liftedAt}
          onChange={(e) => setLiftedAt(e.target.value as 'active' | 'all')}
          className="fp-admin-input"
        >
          <option value="all">All actions</option>
          <option value="active">Active only (not lifted)</option>
        </select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Actions {actions ? `(${actions.length})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading...</p>
          ) : !actions || actions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" aria-hidden />
              <p className="text-sm font-semibold text-green-700">No enforcement actions found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pl-4 text-left font-semibold">Vendor</th>
                  <th className="py-2 text-left font-semibold">Type</th>
                  <th className="py-2 text-left font-semibold">Reason</th>
                  <th className="py-2 text-left font-semibold">Notice sent</th>
                  <th className="py-2 text-left font-semibold">Effective</th>
                  <th className="py-2 text-left font-semibold">Notice timing</th>
                  <th className="py-2 text-left font-semibold">Status</th>
                  <th className="py-2 pr-4 text-left font-semibold">Appeal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {actions.map((a) => (
                  <tr
                    key={a.id}
                    className={
                      a.noticeLate
                        ? 'bg-red-50 hover:bg-red-100'
                        : 'hover:bg-muted/30'
                    }
                  >
                    <td className="py-2.5 pl-4 font-medium">
                      <Link href={`/vendors/${a.vendorId}`} className="hover:underline">
                        {a.vendor.businessName}
                      </Link>
                      <div className="text-xs text-muted-foreground capitalize">{a.vendor.status}</div>
                    </td>
                    <td className="py-2.5">
                      <StatusPill tone={ACTION_TONE[a.actionType] ?? 'neutral'}>
                        {a.actionType}
                      </StatusPill>
                    </td>
                    <td className="py-2.5 max-w-xs">
                      <div className="font-medium">
                        {REASON_CODE_LABELS[a.reasonCode as keyof typeof REASON_CODE_LABELS] ??
                          a.reasonCode}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{a.reasonNarrative}</div>
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {a.noticeSentAt ? formatDate(a.noticeSentAt) : '-'}
                    </td>
                    <td className="py-2.5 text-muted-foreground">{formatDate(a.effectiveAt)}</td>
                    <td className="py-2.5">
                      {a.urgentBasis ? (
                        <StatusPill tone="warning">Urgent</StatusPill>
                      ) : a.noticeLate ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                          Late notice
                        </span>
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Notice before effect" />
                      )}
                    </td>
                    <td className="py-2.5">
                      {a.liftedAt ? (
                        <StatusPill tone="neutral">Lifted {formatDate(a.liftedAt)}</StatusPill>
                      ) : (
                        <StatusPill tone="danger">Active</StatusPill>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {a.appealId ? (
                        <Link
                          href={`/legal/appeals`}
                          className="text-xs underline hover:text-foreground"
                        >
                          View appeal
                        </Link>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

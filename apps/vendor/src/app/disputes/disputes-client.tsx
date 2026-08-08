'use client';

import { cn } from '@feastpot/ui';
import { AlertTriangle, Clock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useDisputes, type DisputeStatus } from '@/hooks/use-disputes';
import { ApiError } from '@/lib/api/client';
import { formatDate } from '@/lib/format';

import {
  ISSUE_TYPE_LABEL,
  SEVERITY_BADGE,
  SEVERITY_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
} from './dispute-ui';

/** Show time remaining until the vendor response deadline. */
function formatRespondDeadline(vendorRespondBy: string | null | undefined, createdAt: string): string {
  // Use the API-provided deadline when available, otherwise fall back to 48h from creation.
  const deadline = vendorRespondBy
    ? new Date(vendorRespondBy)
    : new Date(new Date(createdAt).getTime() + 48 * 60 * 60 * 1000);
  const msLeft = deadline.getTime() - Date.now();
  if (msLeft <= 0) return 'Response overdue';
  const hoursLeft = Math.floor(msLeft / (60 * 60 * 1000));
  if (hoursLeft < 1) return 'Less than 1 hour to respond';
  if (hoursLeft < 24) return `Respond within ${hoursLeft}h`;
  const daysLeft = Math.floor(hoursLeft / 24);
  const remainingHours = hoursLeft % 24;
  return remainingHours > 0
    ? `Respond within ${daysLeft}d ${remainingHours}h`
    : `Respond within ${daysLeft}d`;
}


const STATUS_FILTERS: { value: DisputeStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'vendor_contacted', label: 'Responded' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

/**
 * Disputes list - filter pills by status + a card per dispute showing the
 * order number, issue type, severity/status badges, raised date, and an
 * SLA hint ("respond within 24h") on open disputes that still need a reply.
 */
export function DisputesClient() {
  const [status, setStatus] = useState<DisputeStatus | 'all'>('all');
  const { data, isLoading, isError, error } = useDisputes({
    status: status === 'all' ? undefined : status,
  });

  const disputes = data?.data ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-dark">Disputes</h1>
        <p className="mt-1 text-sm text-mid">
          Review and respond to disputes raised on your orders. Prompt responses keep cases from
          being escalated.
        </p>
      </header>

      <div aria-label="Filter by status" className="flex items-center gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => {
          const isActive = status === f.value;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => setStatus(f.value)}
              className={cn(
                'inline-flex items-center whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors',
                isActive
                  ? 'border-teal bg-teal text-white shadow-sm'
                  : 'border-border bg-white text-mid hover:bg-surface hover:text-dark',
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {isError ? (
        <div className="fp-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Could not load disputes. Please try again.'}
        </div>
      ) : isLoading ? (
        <div className="fp-card border border-border bg-white p-6 text-center text-sm text-mid">
          Loading disputes…
        </div>
      ) : disputes.length === 0 ? (
        <div className="fp-card border border-border bg-white p-10 text-center">
          <p className="text-base font-semibold text-dark">No disputes</p>
          <p className="mt-1 text-xs text-mid">
            {status === 'all'
              ? 'You have no disputes on your orders. Nice work!'
              : 'No disputes match this status filter.'}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {disputes.map((d) => {
            const needsResponse = d.status === 'open' && !d.vendorRespondedAt;
            return (
              <li key={d.id}>
                <Link
                  href={`/disputes/${d.id}`}
                  className="fp-card block border border-border bg-white p-4 transition-colors hover:border-teal"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-dark">
                        Order {d.order?.orderNumber ?? `#${d.orderId.slice(-6)}`}
                      </p>
                      <p className="mt-0.5 text-xs text-mid">
                        {ISSUE_TYPE_LABEL[d.issueType] ?? d.issueType}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                        STATUS_BADGE[d.status] ?? 'bg-surface text-mid',
                      )}
                    >
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </div>

                  <p className="mt-2 line-clamp-2 text-xs text-mid">{d.description}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold',
                        SEVERITY_BADGE[d.severity] ?? 'bg-surface text-mid',
                      )}
                    >
                      {d.severity === 'high' && <AlertTriangle className="h-3 w-3" aria-hidden />}
                      {SEVERITY_LABEL[d.severity] ?? d.severity} severity
                    </span>
                    <span className="text-mid">Raised {formatDate(d.createdAt)}</span>
                  </div>

                  {needsResponse && (
                    <div className="mt-3 flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      {formatRespondDeadline(d.vendorRespondBy, d.createdAt)}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

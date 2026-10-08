'use client';

import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageHeader } from '@/components/layout/page-header';
import { useApi } from '@/hooks/use-api';
import type { StaffRole } from '@/lib/admin-destinations';

interface DeletionBlocker {
  code: string;
  message: string;
  count: number;
}

interface DeletionItem {
  id: string;
  userId: string;
  status: 'requested' | 'cancelled' | 'processing' | 'blocked' | 'completed';
  requestedAt: string;
  eligibleAt: string;
  reason: string | null;
  blockers: DeletionBlocker[];
  isTestData?: boolean;
}

interface DeletionList {
  items: DeletionItem[];
}

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';
const activeStatuses = ['requested', 'blocked'];

function dateTime(value: string) {
  return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function AccountDeletionsClient({ role }: { role: StaffRole }) {
  const { request, ready } = useApi();
  const queryClient = useQueryClient();
  const isAdmin = role === 'admin';
  const [userId, setUserId] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [includeTestData, setIncludeTestData] = useState(false);

  const list = useQuery({
    queryKey: ['admin-account-deletions', includeTestData],
    queryFn: () =>
      request<DeletionList>(`/admin/account-deletions?includeTestData=${includeTestData}`, {
        cache: 'no-store',
      }),
    enabled: ready,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-account-deletions'] });
  const create = useMutation({
    mutationFn: () =>
      request<DeletionItem>('/admin/account-deletions', {
        method: 'POST',
        body: { userId: userId.trim(), reason: requestReason.trim(), confirmation: 'DELETE' },
      }),
    onSuccess: () => {
      setUserId('');
      setRequestReason('');
      setErrorMessage(null);
      void refresh();
    },
    onError: () =>
      setErrorMessage(
        'Could not create the request. Check the user ID and reason, then try again.',
      ),
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      request<DeletionItem>(`/admin/account-deletions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        body: { reason },
      }),
    onSuccess: (_item, variables) => {
      setCancelReasons((current) => ({ ...current, [variables.id]: '' }));
      setErrorMessage(null);
      void refresh();
    },
    onError: () => setErrorMessage('Could not cancel the request. Check the reason and try again.'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account deletions"
        description="Review deletion requests, live legal checks and the 14-day grace period."
      />
      <div className="flex gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          Requests remain queued while live blockers are present. Do not mark a request as erased:
          final processing may wait for verified settlement or erasure checks.
        </p>
      </div>
      {isAdmin && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-semibold text-foreground">
            Record a deletion request received by email
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the user ID and record the customer&rsquo;s email-request reason. Confirmation
            must be DELETE.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto]">
            <input
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              className={fieldClass}
              placeholder="User ID"
              aria-label="User ID"
            />
            <input
              value={requestReason}
              onChange={(event) => setRequestReason(event.target.value)}
              className={fieldClass}
              placeholder="Reason from email (10–500 characters)"
              aria-label="Reason from email"
              minLength={10}
              maxLength={500}
            />
            <button
              type="button"
              disabled={
                create.isPending ||
                !userId.trim() ||
                requestReason.trim().length < 10 ||
                requestReason.trim().length > 500
              }
              onClick={() => create.mutate()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {create.isPending ? 'Recording…' : 'Record request'}
            </button>
          </div>
        </section>
      )}
      {errorMessage && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage}
        </p>
      )}
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={includeTestData}
          onChange={(event) => setIncludeTestData(event.target.checked)}
        />
        Include labelled test requests
      </label>
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold text-foreground">Request queue</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {list.data?.items.length ?? 0} requests · refreshed automatically
            </p>
          </div>
          <button
            type="button"
            onClick={() => void list.refetch()}
            disabled={list.isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${list.isFetching ? 'animate-spin' : ''}`} aria-hidden />
            Refresh
          </button>
        </div>
        {list.isLoading && (
          <div className="space-y-3 p-5" aria-label="Loading requests">
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
          </div>
        )}
        {list.error && (
          <div className="p-6 text-sm text-destructive">
            Unable to load deletion requests.{' '}
            <button
              type="button"
              onClick={() => void list.refetch()}
              className="font-semibold underline"
            >
              Try again
            </button>
          </div>
        )}
        {!list.isLoading && !list.error && list.data?.items.length === 0 && (
          <div className="p-10 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 font-semibold text-foreground">No deletion requests</p>
            <p className="mt-1 text-sm text-muted-foreground">New requests will appear here.</p>
          </div>
        )}
        <div className="divide-y divide-border">
          {list.data?.items.map((item) => (
            <article key={item.id} className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold text-foreground">
                    User {item.userId}
                  </p>
                  {item.isTestData && (
                    <p className="text-xs font-semibold text-muted-foreground">Test data</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Request {item.id} · received {dateTime(item.requestedAt)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${item.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : item.status === 'blocked' ? 'bg-amber-100 text-amber-900' : item.status === 'cancelled' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}
                >
                  {item.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Grace period ends{' '}
                <strong className="font-semibold text-foreground">
                  {dateTime(item.eligibleAt)}
                </strong>
              </p>
              {item.reason && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Recorded reason:</span>{' '}
                  {item.reason}
                </p>
              )}
              {item.blockers.length > 0 ? (
                <div className="space-y-1 rounded-lg border border-amber-300/50 bg-amber-50 p-3">
                  <p className="text-xs font-bold text-amber-950">Live blockers</p>
                  {item.blockers.map((blocker) => (
                    <p key={blocker.code} className="text-sm text-amber-900">
                      <strong>{blocker.code}:</strong> {blocker.message}
                      {blocker.count > 1 ? ` (${blocker.count})` : ''}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No blockers currently reported.</p>
              )}
              <p className="text-xs text-muted-foreground">
                The 14-day grace period is not a promise of automatic erasure. Final erasure remains
                pending until verification succeeds.
              </p>
              {isAdmin && activeStatuses.includes(item.status) && (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={cancelReasons[item.id] ?? ''}
                    onChange={(event) =>
                      setCancelReasons((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                    className={fieldClass}
                    placeholder="Cancellation reason (10–500 characters)"
                    aria-label={`Cancellation reason for ${item.userId}`}
                    minLength={10}
                    maxLength={500}
                  />
                  <button
                    type="button"
                    disabled={
                      cancel.isPending ||
                      (cancelReasons[item.id] ?? '').trim().length < 10 ||
                      (cancelReasons[item.id] ?? '').trim().length > 500
                    }
                    onClick={() =>
                      cancel.mutate({ id: item.id, reason: cancelReasons[item.id]?.trim() ?? '' })
                    }
                    className="rounded-lg border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cancel.isPending ? 'Cancelling…' : 'Cancel request'}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

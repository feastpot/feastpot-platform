'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useAccessToken } from '@/lib/auth/use-access-token';
import { apiRequest } from '@/lib/api/client';
import type { AccountDeletionState } from '@/types/account-deletion';

export function CloseAccountClient({ businessName }: { businessName: string }) {
  const { token, loading: authLoading } = useAccessToken();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['account-deletion'],
    queryFn: () => apiRequest<AccountDeletionState>('/users/me/deletion', { accessToken: token! }),
    enabled: Boolean(token),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
  const changeRequest = useMutation({
    mutationFn: (action: 'request' | 'cancel') =>
      apiRequest<AccountDeletionState>('/users/me/deletion', {
        method: action === 'request' ? 'POST' : 'DELETE',
        ...(action === 'request' ? { body: { confirmation: 'DELETE' } } : {}),
        accessToken: token!,
      }),
    onSuccess: (state) => {
      queryClient.setQueryData(['account-deletion'], state);
      setConfirmation('');
      setErrorMessage(null);
    },
    onError: () => setErrorMessage('We could not update your request. Please try again.'),
  });
  const exportData = useMutation({
    mutationFn: () =>
      apiRequest<Record<string, unknown>>('/users/me/export', { accessToken: token! }),
    onError: () => setErrorMessage('We could not prepare your data export. Please try again.'),
  });
  const request = query.data?.request;
  const canCancel = request && ['requested', 'blocked'].includes(request.status);

  const downloadExport = async () => {
    setErrorMessage(null);
    try {
      const data = await exportData.mutateAsync();
      const href = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = href;
      link.download = `feastpot-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(href);
    } catch {
      // Mutation exposes the actionable error message above.
    }
  };

  if (authLoading || !token)
    return (
      <div className="min-h-full bg-surface p-6">
        <p className="text-sm text-mid">Loading account…</p>
      </div>
    );

  return (
    <div className="min-h-full space-y-6 bg-surface p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-dark">Close your account</h1>
          <p className="mt-1 text-sm text-mid">
            Request closure for {businessName}. Your listing is unpublished immediately when the
            request is accepted.
          </p>
        </header>
        <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">What happens to your data</h2>
          <p className="text-sm text-amber-800">
            Financial and legal records are retained in anonymised form for six years. Restricted
            seller identity information required by law may be retained for five years after the
            last reporting period. Ordinary name, contact, address, photos, documents and sign-in
            identities are erased only after final processing.
          </p>
          <p className="text-sm text-amber-800">
            A request has a 14-day cancellation period. This is not a promise of automatic deletion
            when the period ends. Final erasure waits for verified processing and any outstanding
            checks.
          </p>
        </section>
        <section className="space-y-4 rounded-xl border border-cream-deep bg-white p-5">
          <h2 className="font-semibold text-dark">Your deletion request</h2>
          {query.isLoading && (
            <div
              className="h-16 animate-pulse rounded-lg bg-surface"
              aria-label="Loading deletion status"
            />
          )}
          {query.error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              Could not load your request status.{' '}
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="font-semibold underline"
              >
                Try again
              </button>
            </div>
          )}
          {query.data && !request && (
            <p className="text-sm text-mid">There is no active deletion request.</p>
          )}
          {request && (
            <div className="space-y-3 rounded-lg bg-surface p-4">
              <p className="text-sm font-semibold text-dark">
                Status: <span className="capitalize">{request.status}</span>
              </p>
              <p className="text-sm text-mid">
                Grace period ends{' '}
                <strong>
                  {new Date(request.eligibleAt).toLocaleString('en-GB', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}
                </strong>
                . A request is not confirmation of erasure.
              </p>
              {query.data?.blockers.length ? (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-900">Live checks</p>
                  {query.data.blockers.map((blocker) => (
                    <p key={blocker.code} className="text-sm text-mid">
                      <strong>{blocker.code}:</strong> {blocker.message}
                      {blocker.count > 1 ? ` (${blocker.count})` : ''}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-mid">No live blockers are currently reported.</p>
              )}
              {canCancel && (
                <button
                  type="button"
                  disabled={changeRequest.isPending}
                  onClick={() => changeRequest.mutate('cancel')}
                  className="rounded-lg border border-cream-deep px-4 py-2 text-sm font-semibold text-dark hover:bg-white disabled:opacity-50"
                >
                  {changeRequest.isPending ? 'Cancelling…' : 'Cancel request'}
                </button>
              )}
            </div>
          )}
          {(!request || request.status === 'cancelled') && (
            <div className="space-y-3 border-t border-cream-deep pt-4">
              <button
                type="button"
                disabled={exportData.isPending}
                onClick={downloadExport}
                className="rounded-lg border border-cream-deep px-4 py-2 text-sm font-semibold text-dark hover:bg-surface disabled:opacity-50"
              >
                {exportData.isPending ? 'Preparing export…' : 'Download my data first'}
              </button>
              <label className="block text-sm font-semibold text-dark">
                Type DELETE to request closure
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-cream-deep px-3 py-2 font-normal"
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                disabled={confirmation !== 'DELETE' || changeRequest.isPending}
                onClick={() => changeRequest.mutate('request')}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {changeRequest.isPending ? 'Submitting…' : 'Request account deletion'}
              </button>
            </div>
          )}
          {errorMessage && (
            <p role="alert" className="text-sm text-red-800">
              {errorMessage}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

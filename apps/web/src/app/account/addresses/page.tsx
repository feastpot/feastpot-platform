'use client';

import Link from 'next/link';
import { useState } from 'react';

import { PageShell } from '@/components/layout/page-shell';
import { useAddresses, useDeleteAddress, useSetDefaultAddress } from '@/hooks/use-addresses';
import type { Address } from '@/lib/api/addresses';
import { ApiError } from '@/lib/api/client';

/**
 * Saved-addresses list. /account/* is auth-gated by the root middleware so
 * we can render directly. Mutations invalidate the shared cache so all
 * other consumers (checkout's <AddressSelector />) reflect changes.
 */
export default function AddressesListPage() {
  const { data, isLoading, error } = useAddresses();
  const setDefault = useSetDefaultAddress();
  const del = useDeleteAddress();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const onDelete = async (id: string) => {
    setActionError(null);
    try {
      await del.mutateAsync(id);
      setConfirmId(null);
    } catch (err) {
      // The API blocks deleting addresses tied to active orders with a 409
      // and a code we can match on for friendlier copy.
      if (err instanceof ApiError && err.code === 'ADDRESS_IN_USE') {
        setActionError(
          'This address is used by an active order. Wait for that order to be delivered before deleting it.',
        );
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('Failed to delete address.');
      }
    }
  };

  return (
    <PageShell>
      <div className="space-y-5 py-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Saved addresses</h1>
            <p className="text-sm text-muted-foreground">Manage delivery addresses to speed up checkout.</p>
          </div>
          <Link
            href="/account/addresses/new"
            className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Add new
          </Link>
        </header>

        {isLoading && <p className="text-sm text-muted-foreground">Loading addresses&hellip;</p>}

        {error && !isLoading && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Could not load your addresses. Please refresh.
          </p>
        )}

        {data && data.length === 0 && !isLoading && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-foreground">No saved addresses.</p>
            <p className="mt-1 text-xs text-muted-foreground">Add one to speed up checkout.</p>
            <Link
              href="/account/addresses/new"
              className="mt-4 inline-flex rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Add your first address
            </Link>
          </div>
        )}

        {data && data.length > 0 && (
          <ul className="space-y-3">
            {data.map((a) => (
              <li key={a.id} className="rounded-lg border border-border bg-card p-4">
                <AddressRow
                  address={a}
                  pendingDefault={setDefault.isPending && setDefault.variables === a.id}
                  onSetDefault={() => setDefault.mutate(a.id)}
                  onDelete={() => setConfirmId(a.id)}
                />
              </li>
            ))}
          </ul>
        )}

        {actionError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {actionError}
          </p>
        )}

        {confirmId && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
            onClick={() => setConfirmId(null)}
          >
            <div
              className="w-full max-w-sm rounded-lg bg-background p-5 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold">Delete this address?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This can&rsquo;t be undone. We won&rsquo;t let you delete it if it&rsquo;s used by an in-flight order.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40"
                  onClick={() => setConfirmId(null)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  disabled={del.isPending}
                  onClick={() => onDelete(confirmId)}
                >
                  {del.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function AddressRow({
  address,
  pendingDefault,
  onSetDefault,
  onDelete,
}: {
  address: Address;
  pendingDefault: boolean;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="text-sm">
        <p className="flex items-center gap-2 font-semibold">
          {address.label || 'Address'}
          {address.isDefault && (
            <span className="rounded-full bg-teal-light px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-teal-dark">
              Default
            </span>
          )}
        </p>
        <p className="mt-1 text-muted-foreground">{address.line1}</p>
        {address.line2 && <p className="text-muted-foreground">{address.line2}</p>}
        <p className="text-muted-foreground">
          {address.city}, {address.postcode}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {!address.isDefault && (
          <button
            type="button"
            onClick={onSetDefault}
            disabled={pendingDefault}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40 disabled:opacity-50"
          >
            {pendingDefault ? 'Saving…' : 'Set as default'}
          </button>
        )}
        <Link
          href={`/account/addresses/${address.id}/edit`}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
        >
          Edit
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

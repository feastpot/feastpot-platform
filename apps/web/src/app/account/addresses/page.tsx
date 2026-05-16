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
            <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">Saved addresses</h1>
            <p className="text-sm text-charcoal-mid">Manage delivery addresses to speed up checkout.</p>
          </div>
          <Link
            href="/account/addresses/new"
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-dark"
          >
            Add new
          </Link>
        </header>

        {isLoading && <p className="text-sm text-charcoal-mid">Loading addresses&hellip;</p>}

        {error && !isLoading && (
          <p className="rounded-xl border border-scotch/30 bg-scotch/10 p-3 text-sm font-medium text-scotch">
            Could not load your addresses. Please refresh.
          </p>
        )}

        {data && data.length === 0 && !isLoading && (
          <div className="rounded-2xl border border-dashed border-cream-deep bg-white p-6 text-center">
            <p className="text-sm font-bold text-charcoal">No saved addresses.</p>
            <p className="mt-1 text-xs text-charcoal-mid">Add one to speed up checkout.</p>
            <Link
              href="/account/addresses/new"
              className="mt-4 inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-dark"
            >
              Add your first address
            </Link>
          </div>
        )}

        {data && data.length > 0 && (
          <ul className="space-y-3">
            {data.map((a) => (
              <li key={a.id} className="rounded-2xl border border-cream-deep bg-white p-4 shadow-sm">
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
          <p className="rounded-xl border border-scotch/30 bg-scotch/10 p-3 text-sm font-medium text-scotch">
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
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-display text-lg font-black text-charcoal">Delete this address?</h2>
              <p className="mt-2 text-sm text-charcoal-mid">
                This can&rsquo;t be undone. We won&rsquo;t let you delete it if it&rsquo;s used by an in-flight order.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="rounded-xl border border-cream-deep px-4 py-2.5 text-sm font-bold text-charcoal hover:bg-cream"
                  onClick={() => setConfirmId(null)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-xl bg-scotch px-4 py-2.5 text-sm font-bold text-white hover:bg-scotch-dark disabled:opacity-50"
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
        <p className="flex items-center gap-2 font-bold text-charcoal">
          {address.label || 'Address'}
          {address.isDefault && (
            <span className="rounded-full bg-brand-light px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-dark">
              Default
            </span>
          )}
        </p>
        <p className="mt-1 text-charcoal-mid">{address.line1}</p>
        {address.line2 && <p className="text-charcoal-mid">{address.line2}</p>}
        <p className="text-charcoal-mid">
          {address.city}, {address.postcode}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {!address.isDefault && (
          <button
            type="button"
            onClick={onSetDefault}
            disabled={pendingDefault}
            className="rounded-full border border-cream-deep bg-white px-3 py-1.5 text-xs font-bold text-charcoal hover:bg-cream disabled:opacity-50"
          >
            {pendingDefault ? 'Saving…' : 'Set as default'}
          </button>
        )}
        <Link
          href={`/account/addresses/${address.id}/edit`}
          className="rounded-full border border-cream-deep bg-white px-3 py-1.5 text-xs font-bold text-charcoal hover:bg-cream"
        >
          Edit
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-full border border-scotch/40 bg-white px-3 py-1.5 text-xs font-bold text-scotch hover:bg-scotch/10"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

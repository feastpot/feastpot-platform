'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { AddressForm } from '@/components/address/address-form';
import { PageShell } from '@/components/layout/page-shell';
import { useAddresses, useUpdateAddress } from '@/hooks/use-addresses';

/**
 * We hydrate the form from the cached `useAddresses()` list rather than
 * adding a `GET /v1/addresses/:id` round-trip — the list lands during the
 * normal account browse anyway and is shared via TanStack Query.
 */
export default function EditAddressPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading } = useAddresses();
  const update = useUpdateAddress();
  const [serverError, setServerError] = useState<string | null>(null);

  const address = data?.find((a) => a.id === id);

  if (isLoading) {
    return (
      <PageShell>
        <p className="py-12 text-center text-sm text-muted-foreground">Loading address&hellip;</p>
      </PageShell>
    );
  }

  if (!address) {
    return (
      <PageShell>
        <div className="space-y-3 py-12 text-center">
          <h1 className="text-xl font-semibold">Address not found</h1>
          <p className="text-sm text-muted-foreground">It may have been deleted from another device.</p>
          <button
            onClick={() => router.push('/account/addresses')}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40"
          >
            Back to addresses
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="space-y-4 py-4">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Edit address</h1>
        </header>

        <AddressForm
          initial={{
            label: address.label ?? undefined,
            line1: address.line1,
            line2: address.line2 ?? undefined,
            city: address.city,
            postcode: address.postcode,
            isDefault: address.isDefault,
          }}
          submitLabel="Save changes"
          pending={update.isPending}
          serverError={serverError}
          onSubmit={async (input) => {
            setServerError(null);
            try {
              await update.mutateAsync({ id: address.id, input });
              router.push('/account/addresses');
            } catch (err) {
              setServerError(err instanceof Error ? err.message : 'Failed to update address.');
            }
          }}
          onCancel={() => router.push('/account/addresses')}
        />
      </div>
    </PageShell>
  );
}

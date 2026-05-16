'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AddressForm } from '@/components/address/address-form';
import { PageShell } from '@/components/layout/page-shell';
import { useCreateAddress } from '@/hooks/use-addresses';

export default function NewAddressPage() {
  const router = useRouter();
  const create = useCreateAddress();
  const [serverError, setServerError] = useState<string | null>(null);

  return (
    <PageShell>
      <div className="space-y-4 py-4">
        <header>
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">Add address</h1>
          <p className="text-sm text-charcoal-mid">UK addresses only. We use postcodes.io for delivery checks.</p>
        </header>

        <AddressForm
          submitLabel="Save address"
          pending={create.isPending}
          serverError={serverError}
          onSubmit={async (input) => {
            setServerError(null);
            try {
              await create.mutateAsync(input);
              router.push('/account/addresses');
            } catch (err) {
              setServerError(err instanceof Error ? err.message : 'Failed to save address.');
            }
          }}
          onCancel={() => router.push('/account/addresses')}
        />
      </div>
    </PageShell>
  );
}

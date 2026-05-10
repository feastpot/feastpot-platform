'use client';

import { useEffect, useState } from 'react';

import { AddressForm } from '@/components/address/address-form';
import { useAddresses, useCreateAddress } from '@/hooks/use-addresses';
import type { Address } from '@/lib/api/addresses';

export interface AddressSelectorProps {
  /** Selected addressId. `null` means "use new inline address" or no selection yet. */
  value: string | null;
  onChange: (addressId: string | null) => void;
  /** Surface server errors from the inline create form to the parent if needed. */
  onCreateError?: (message: string) => void;
}

/**
 * Reusable address picker for the checkout page.
 *
 * - Renders saved addresses as a radio list, default first.
 * - Pre-selects the default (or the most-recent) address on mount.
 * - "Add a new address" expands an inline form that POSTs immediately on
 *   save and selects the new id — the customer never leaves /checkout.
 * - Returns `null` from `value` when the user is mid-add; the parent
 *   should disable the "Place order" button in that state.
 */
export function AddressSelector({ value, onChange, onCreateError }: AddressSelectorProps) {
  const { data: addresses, isLoading } = useAddresses();
  const createAddr = useCreateAddress();
  const [showForm, setShowForm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Default-selection effect: once the list arrives, pre-select the default
  // (or first) address. We only do this if the parent hasn't already chosen.
  useEffect(() => {
    if (!addresses || value !== null) return;
    if (addresses.length === 0) {
      setShowForm(true);
      return;
    }
    const def = addresses.find((a) => a.isDefault) ?? addresses[0];
    if (def) onChange(def.id);
  }, [addresses, value, onChange]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading saved addresses&hellip;</p>;
  }

  return (
    <div className="space-y-3">
      {addresses && addresses.length > 0 && (
        <ul className="space-y-2">
          {addresses.map((a) => (
            <li key={a.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/40">
                <input
                  type="radio"
                  name="address"
                  checked={!showForm && value === a.id}
                  onChange={() => {
                    setShowForm(false);
                    onChange(a.id);
                  }}
                  className="mt-1 h-4 w-4"
                />
                <span className="text-sm">
                  <span className="flex items-center gap-2">
                    {a.label && <strong>{a.label}</strong>}
                    {a.isDefault && (
                      <span className="rounded-full bg-teal-light px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-teal-dark">
                        Default
                      </span>
                    )}
                  </span>
                  <span className="block text-muted-foreground">{formatLine(a)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border p-3 text-sm">
        <input
          type="radio"
          name="address"
          checked={showForm}
          onChange={() => {
            setShowForm(true);
            onChange(null);
          }}
          className="h-4 w-4"
        />
        Add a new address
      </label>

      {showForm && (
        <div className="rounded-md border border-border p-3">
          <AddressForm
            submitLabel="Save address"
            pending={createAddr.isPending}
            serverError={serverError}
            hideDefaultToggle
            onSubmit={async (input) => {
              setServerError(null);
              try {
                const created = await createAddr.mutateAsync(input);
                setShowForm(false);
                onChange(created.id);
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to save address.';
                setServerError(msg);
                onCreateError?.(msg);
              }
            }}
            onCancel={
              addresses && addresses.length > 0
                ? () => {
                    setShowForm(false);
                    const def = addresses.find((a) => a.isDefault) ?? addresses[0];
                    if (def) onChange(def.id);
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

function formatLine(a: Address) {
  return [a.line1, a.line2, a.city, a.postcode].filter(Boolean).join(', ');
}

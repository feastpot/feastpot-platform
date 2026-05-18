'use client';

import { useState, type FormEvent } from 'react';

import type { CreateAddressInput } from '@/lib/api/addresses';

/** UK postcode format used by the API DTO - kept identical so client-side validation matches server. */
export const UK_POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i;

export interface AddressFormProps {
  initial?: Partial<CreateAddressInput>;
  submitLabel: string;
  pending?: boolean;
  serverError?: string | null;
  onSubmit: (input: CreateAddressInput) => void | Promise<void>;
  onCancel?: () => void;
  /** Hide the "Set as default" toggle in contexts where it doesn't apply (e.g. inline checkout add). */
  hideDefaultToggle?: boolean;
}

const inputCls =
  'w-full rounded-xl border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';

/**
 * Shared address form used by:
 *  - /account/addresses/new
 *  - /account/addresses/[id]/edit
 *  - the inline "Add new address" panel inside <AddressSelector />
 *
 * Validates postcode client-side with the same regex the API uses so the
 * customer sees the error before a round-trip. All other constraints
 * (length, required) are enforced by both sides.
 */
export function AddressForm({
  initial,
  submitLabel,
  pending,
  serverError,
  onSubmit,
  onCancel,
  hideDefaultToggle,
}: AddressFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [line1, setLine1] = useState(initial?.line1 ?? '');
  const [line2, setLine2] = useState(initial?.line2 ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [postcode, setPostcode] = useState(initial?.postcode ?? '');
  const [isDefault, setIsDefault] = useState(Boolean(initial?.isDefault));
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (line1.trim().length < 3) {
      setLocalError('Address line 1 must be at least 3 characters.');
      return;
    }
    if (city.trim().length === 0) {
      setLocalError('City is required.');
      return;
    }
    const trimmedPostcode = postcode.trim().toUpperCase();
    if (!UK_POSTCODE_REGEX.test(trimmedPostcode)) {
      setLocalError('Please enter a valid UK postcode (e.g. SE15 4ST).');
      return;
    }

    await onSubmit({
      label: label.trim() || undefined,
      line1: line1.trim(),
      line2: line2.trim() || undefined,
      city: city.trim(),
      postcode: trimmedPostcode,
      ...(hideDefaultToggle ? {} : { isDefault }),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label="Label (optional)">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          placeholder="Home, Office, Mum's…"
          className={inputCls}
        />
      </Field>

      <Field label="Address line 1" required>
        <input
          value={line1}
          onChange={(e) => setLine1(e.target.value)}
          autoComplete="address-line1"
          required
          className={inputCls}
        />
      </Field>

      <Field label="Address line 2">
        <input
          value={line2}
          onChange={(e) => setLine2(e.target.value)}
          autoComplete="address-line2"
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="City" required>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            autoComplete="address-level2"
            required
            className={inputCls}
          />
        </Field>
        <Field label="Postcode" required>
          <input
            value={postcode}
            onChange={(e) => setPostcode(e.target.value.toUpperCase())}
            autoComplete="postal-code"
            required
            inputMode="text"
            className={inputCls}
          />
        </Field>
      </div>

      {!hideDefaultToggle && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 rounded border-cream-deep accent-brand"
          />
          <span className="font-medium text-charcoal">Set as my default delivery address</span>
        </label>
      )}

      {(localError || serverError) && (
        <p className="rounded-xl border border-scotch/30 bg-scotch/10 p-3 text-sm font-medium text-scotch">
          {localError ?? serverError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-cream-deep bg-white px-5 py-3 text-sm font-bold text-charcoal hover:bg-cream"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-bold text-charcoal">
        {label}
        {required && <span className="ml-0.5 text-scotch">*</span>}
      </span>
      {children}
    </label>
  );
}

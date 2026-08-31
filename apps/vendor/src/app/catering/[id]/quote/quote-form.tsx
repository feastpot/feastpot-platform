'use client';

import {
  calculateCateringDeposit,
  MINIMUM_CATERING_QUOTE_PENCE,
} from '@feastpot/config/catering-deposit';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import {
  useCreateCateringBooking,
  useFillCateringQuote,
  useSendCateringQuote,
  useVendorCateringBooking,
} from '@/hooks/use-catering-bookings';
import type { CateringLineItemInput } from '@/lib/api/catering-bookings';
import { useAuth } from '@/lib/auth/auth-provider';

// UK regulated allergen names as defined in the Food Information Regulations 2014
// (implementing EU FIC Annex II). "cereals containing gluten" and "tree nuts"
// must use the full regulated phrase - "cereals" and "nuts" are ambiguous.
const COMMON_ALLERGENS = [
  'celery',
  'cereals containing gluten',
  'crustaceans',
  'eggs',
  'fish',
  'lupin',
  'milk',
  'molluscs',
  'mustard',
  'tree nuts',
  'peanuts',
  'sesame',
  'soya',
  'sulphites',
];

function formatPounds(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultExpiry() {
  return toDatetimeLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
}

/** Max allowed expiry given an event date: earlier of 7 days from now and 48 h before event. */
function maxExpiryMs(eventDateIso: string): number {
  const eventMs = new Date(eventDateIso).getTime();
  const cutoffMs = eventMs - 48 * 60 * 60 * 1000;
  const sevenDaysMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
  return Math.min(cutoffMs, sevenDaysMs);
}

interface LineItemState {
  description: string;
  quantity: string;
  unitPounds: string;
  allergens: string[];
}

function emptyItem(): LineItemState {
  return { description: '', quantity: '1', unitPounds: '', allergens: [] };
}

export function CateringQuoteForm({
  enquiryId,
  bookingId,
}: {
  enquiryId?: string;
  bookingId?: string;
}) {
  const router = useRouter();
  const { accessToken } = useAuth();

  const { data: existing } = useVendorCateringBooking(bookingId, accessToken);

  const create = useCreateCateringBooking(accessToken);
  const fill = useFillCateringQuote(bookingId ?? '', accessToken);
  const send = useSendCateringQuote(bookingId ?? '', accessToken);

  const [items, setItems] = useState<LineItemState[]>([emptyItem()]);
  const [eventDate, setEventDate] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [eventAddress, setEventAddress] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [minimumDepositPounds, setMinimumDepositPounds] = useState('0.00');
  const [quoteExpiry, setQuoteExpiry] = useState(defaultExpiry());
  const [expiryClamped, setExpiryClamped] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setEventDate(existing.eventDate ? new Date(existing.eventDate).toISOString().slice(0, 16) : '');
    setGuestCount(String(existing.guestCount));
    setEventAddress(existing.eventAddress ?? '');
    setPreferredTime(existing.preferredTime ?? '');
    setMinimumDepositPounds((existing.minimumDepositPence / 100).toFixed(2));
    setQuoteExpiry(new Date(existing.quoteExpiresAt).toISOString().slice(0, 16));
    if (existing.lineItems && existing.lineItems.length > 0) {
      setItems(
        existing.lineItems.map((li) => ({
          description: li.description,
          quantity: String(li.quantity),
          unitPounds: (li.unitPence / 100).toFixed(2),
          allergens: li.allergens,
        })),
      );
    }
  }, [existing]);

  // ── Deposit calculation ────────────────────────────────────────────────────
  const totalPence: number = items.reduce((s, li) => {
    const qty = parseInt(li.quantity || '0', 10) || 0;
    const unit = Math.round(parseFloat(li.unitPounds || '0') * 100) || 0;
    return s + qty * unit;
  }, 0);
  const minimumDepositPence = Math.round(parseFloat(minimumDepositPounds || '0') * 100);
  let depositPence = 0;
  let balancePence = totalPence;
  let totalsConsistent = false;
  if (
    totalPence >= MINIMUM_CATERING_QUOTE_PENCE &&
    Number.isSafeInteger(minimumDepositPence) &&
    minimumDepositPence >= 0
  ) {
    const breakdown = calculateCateringDeposit(totalPence, minimumDepositPence);
    depositPence = breakdown.depositPence;
    balancePence = breakdown.balancePence;
    totalsConsistent = true;
  }

  // ── Expiry clamping ────────────────────────────────────────────────────────
  // Clamp quote expiry to the earlier of: 7 days from now, or 48 h before
  // the event date (vendor terms clause). Runs whenever eventDate changes.
  function applyExpiryClamp(newEventDate: string, currentExpiry: string): string {
    if (!newEventDate) return currentExpiry;
    const ceiling = maxExpiryMs(newEventDate);
    if (new Date(currentExpiry).getTime() <= ceiling) return currentExpiry;
    return toDatetimeLocal(new Date(ceiling));
  }

  function handleEventDateChange(val: string) {
    setEventDate(val);
    if (!val) {
      setExpiryClamped(false);
      return;
    }
    const ceiling = maxExpiryMs(val);
    const currentExpiryMs = new Date(quoteExpiry).getTime();
    if (currentExpiryMs > ceiling) {
      setQuoteExpiry(toDatetimeLocal(new Date(ceiling)));
      setExpiryClamped(true);
    } else {
      setExpiryClamped(false);
    }
  }

  function handleExpiryChange(val: string) {
    setQuoteExpiry(val);
    if (!eventDate || !val) {
      setExpiryClamped(false);
      return;
    }
    const ceiling = maxExpiryMs(eventDate);
    if (new Date(val).getTime() > ceiling) {
      setQuoteExpiry(toDatetimeLocal(new Date(ceiling)));
      setExpiryClamped(true);
    } else {
      setExpiryClamped(false);
    }
  }

  // ── Submit handlers ────────────────────────────────────────────────────────
  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!enquiryId && !bookingId) {
      setServerError('No enquiry ID');
      return;
    }

    const lineItems: CateringLineItemInput[] = items.map((li) => ({
      description: li.description.trim(),
      quantity: parseInt(li.quantity, 10),
      unitPence: Math.round(parseFloat(li.unitPounds) * 100),
      allergens: li.allergens,
    }));

    try {
      const quoteInput = {
        eventDate: eventDate ? new Date(eventDate).toISOString() : undefined,
        guestCount: guestCount ? parseInt(guestCount, 10) : undefined,
        eventAddress: eventAddress.trim() || undefined,
        preferredTime: preferredTime.trim() || undefined,
        lineItems,
        minimumDepositPence,
        quoteExpiresAt: new Date(applyExpiryClamp(eventDate, quoteExpiry)).toISOString(),
      };
      if (bookingId) {
        await fill.mutateAsync(quoteInput);
      } else {
        await create.mutateAsync({ ...quoteInput, enquiryId: enquiryId! });
      }
      router.push('/catering');
    } catch (err) {
      setServerError((err as Error).message);
    }
  }

  async function handleSendQuote() {
    setServerError(null);
    try {
      await send.mutateAsync();
      setSendSuccess(true);
    } catch (err) {
      setServerError((err as Error).message);
    }
  }

  // ── Line item helpers ──────────────────────────────────────────────────────
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, j) => j !== i));
  }

  function updateItem(i: number, field: keyof LineItemState, value: string | string[]) {
    setItems((prev) => prev.map((li, j) => (j === i ? { ...li, [field]: value } : li)));
  }

  function toggleAllergen(i: number, allergen: string) {
    const item = items[i];
    if (!item) return;
    const next = item.allergens.includes(allergen)
      ? item.allergens.filter((a) => a !== allergen)
      : [...item.allergens, allergen];
    updateItem(i, 'allergens', next);
  }

  // ── Derived display state ──────────────────────────────────────────────────
  const isExisting = Boolean(bookingId && existing);
  const canFill = isExisting && existing?.status === 'ASSIGNED';
  const canSend = isExisting && existing?.status === 'QUOTED' && !sendSuccess;

  // Required to enable Save: at least one item with description + price > 0.
  const hasValidItem = items.some(
    (li) => li.description.trim() && parseFloat(li.unitPounds || '0') > 0,
  );
  const hasValidMinimumDeposit =
    Number.isSafeInteger(minimumDepositPence) && minimumDepositPence >= 0;
  const canSaveNew =
    totalPence >= MINIMUM_CATERING_QUOTE_PENCE &&
    hasValidItem &&
    hasValidMinimumDeposit &&
    totalsConsistent;

  // Explain why Save is disabled so the vendor is not left guessing.
  const saveBlockReason: string | null = !hasValidItem
    ? 'Add at least one menu item with a description and unit price to save.'
    : totalPence < MINIMUM_CATERING_QUOTE_PENCE
      ? 'Catering quote total must be at least £50.00 to save.'
      : !hasValidMinimumDeposit
        ? 'Enter a valid minimum deposit amount.'
        : !totalsConsistent
          ? 'Deposit and balance must reconcile with the quote total.'
          : null;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const fieldLabel = 'mb-1 block text-sm font-medium';
  const requiredMarker = (
    <span className="ml-0.5 text-destructive" aria-hidden>
      *
    </span>
  );
  const input =
    'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="space-y-6">
      {isExisting && (
        <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-1">
          <p>
            <strong>Customer:</strong> {existing?.customerName} ({existing?.customerEmail})
          </p>
          <p>
            <strong>Status:</strong> {existing?.status}
          </p>
          {sendSuccess && (
            <p className="text-green-600 font-medium">Quote email sent to customer.</p>
          )}
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-6">
        {/* Event details */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Event details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={fieldLabel}>Event date &amp; time</label>
              <input
                type="datetime-local"
                className={input}
                value={eventDate}
                onChange={(e) => handleEventDateChange(e.target.value)}
              />
            </div>
            <div>
              <label className={fieldLabel}>Guest count</label>
              <input
                type="number"
                className={input}
                placeholder="e.g. 50"
                value={guestCount}
                min={1}
                onChange={(e) => setGuestCount(e.target.value)}
              />
            </div>
            <div>
              <label className={fieldLabel}>Preferred serving time</label>
              <input
                type="text"
                className={input}
                placeholder="e.g. 18:30"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
              />
            </div>
            <div>
              <label className={fieldLabel}>Event address / venue</label>
              <input
                type="text"
                className={input}
                placeholder="e.g. 12 Church Lane, London, E1 7AP"
                value={eventAddress}
                onChange={(e) => setEventAddress(e.target.value)}
              />
            </div>
            <div>
              <label className={fieldLabel}>Quote expires at {requiredMarker}</label>
              <input
                type="datetime-local"
                className={input}
                value={quoteExpiry}
                onChange={(e) => handleExpiryChange(e.target.value)}
              />
              {expiryClamped && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Clamped to 48 hours before the event date (vendor terms).
                </p>
              )}
            </div>
            <div>
              <label className={fieldLabel}>Minimum deposit (£) {requiredMarker}</label>
              <input
                type="number"
                className={input}
                min={0}
                step={0.01}
                required
                value={minimumDepositPounds}
                onChange={(e) => setMinimumDepositPounds(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                We charge the greater of 25% or this amount, capped at the quote total.
              </p>
            </div>
          </div>
        </section>

        {/* Line items */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Menu items {requiredMarker}</h2>
            <button
              type="button"
              onClick={addItem}
              className="text-sm text-primary hover:underline"
            >
              + Add item
            </button>
          </div>

          {items.map((li, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Item {i + 1}</span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className={fieldLabel}>Description {requiredMarker}</label>
                  <input
                    type="text"
                    className={input}
                    placeholder="e.g. Jerk chicken (serves 2)"
                    required
                    value={li.description}
                    onChange={(e) => updateItem(i, 'description', e.target.value)}
                  />
                </div>
                <div>
                  <label className={fieldLabel}>Quantity {requiredMarker}</label>
                  <input
                    type="number"
                    className={input}
                    min={1}
                    required
                    value={li.quantity}
                    onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                  />
                </div>
                <div>
                  <label className={fieldLabel}>Unit price (£) {requiredMarker}</label>
                  <input
                    type="number"
                    className={input}
                    min={0.01}
                    step={0.01}
                    required
                    placeholder="0.00"
                    value={li.unitPounds}
                    onChange={(e) => updateItem(i, 'unitPounds', e.target.value)}
                  />
                </div>
              </div>
              {/* Allergens */}
              <div>
                <label className={`${fieldLabel} text-xs text-muted-foreground`}>
                  Allergens present in this item
                </label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {COMMON_ALLERGENS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAllergen(i, a)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium border transition-colors ${
                        li.allergens.includes(a)
                          ? 'bg-destructive/10 border-destructive text-destructive'
                          : 'border-input bg-background text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Totals */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Total</span>
            <strong>{formatPounds(totalPence)}</strong>
          </div>
          {totalsConsistent ? (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>Deposit (greater of 25% or your minimum)</span>
                <span>{formatPounds(depositPence)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Balance</span>
                <span>{formatPounds(balancePence)}</span>
              </div>
            </>
          ) : (
            <p className="text-destructive text-xs">
              Deposit and balance do not reconcile with the total. Please refresh and try again.
            </p>
          )}
        </div>

        {serverError && <p className="text-sm text-destructive">{serverError}</p>}

        <div className="space-y-2">
          <div className="flex gap-3">
            {(!isExisting || canFill) && (
              <button
                type="submit"
                disabled={create.isPending || fill.isPending || !canSaveNew}
                className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {create.isPending || fill.isPending ? 'Saving...' : 'Save quote'}
              </button>
            )}
            {canSend && (
              <button
                type="button"
                onClick={handleSendQuote}
                disabled={send.isPending}
                className="rounded-md bg-green-600 px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {send.isPending ? 'Sending...' : 'Send quote to customer'}
              </button>
            )}
          </div>
          {/* Required-field legend */}
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive" aria-hidden>
              *
            </span>{' '}
            Required field
          </p>
          {/* Explain why Save is disabled */}
          {(!isExisting || canFill) && saveBlockReason && (
            <p className="text-xs text-muted-foreground">{saveBlockReason}</p>
          )}
        </div>
      </form>
    </div>
  );
}

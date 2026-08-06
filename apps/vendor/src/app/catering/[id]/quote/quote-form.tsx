'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import { useCreateCateringBooking, useSendCateringQuote, useVendorCateringBooking } from '@/hooks/use-catering-bookings';
import type { CateringLineItemInput } from '@/lib/api/catering-bookings';
import { useAuth } from '@/lib/auth/auth-provider';

const COMMON_ALLERGENS = ['celery', 'cereals', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk', 'molluscs', 'mustard', 'nuts', 'peanuts', 'sesame', 'soya', 'sulphites'];

function formatPounds(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function defaultExpiry() {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  // If bookingId is provided, load existing booking
  const { data: existing } = useVendorCateringBooking(bookingId, accessToken);

  const create = useCreateCateringBooking(accessToken);
  const send = useSendCateringQuote(bookingId ?? '', accessToken);

  const [items, setItems] = useState<LineItemState[]>([emptyItem()]);
  const [eventDate, setEventDate] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [eventAddress, setEventAddress] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [quoteExpiry, setQuoteExpiry] = useState(defaultExpiry());
  const [serverError, setServerError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setEventDate(existing.eventDate ? new Date(existing.eventDate).toISOString().slice(0, 16) : '');
    setGuestCount(String(existing.guestCount));
    setEventAddress(existing.eventAddress ?? '');
    setPreferredTime(existing.preferredTime ?? '');
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

  const total = items.reduce((s, li) => {
    const qty = parseInt(li.quantity || '0', 10) || 0;
    const unit = Math.round(parseFloat(li.unitPounds || '0') * 100) || 0;
    return s + qty * unit;
  }, 0);
  const deposit = Math.max(5000, Math.ceil(total * 0.25));

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!enquiryId) { setServerError('No enquiry ID'); return; }

    const lineItems: CateringLineItemInput[] = items.map((li) => ({
      description: li.description.trim(),
      quantity: parseInt(li.quantity, 10),
      unitPence: Math.round(parseFloat(li.unitPounds) * 100),
      allergens: li.allergens,
    }));

    try {
      await create.mutateAsync({
        enquiryId,
        eventDate: eventDate ? new Date(eventDate).toISOString() : undefined,
        guestCount: guestCount ? parseInt(guestCount, 10) : undefined,
        eventAddress: eventAddress.trim() || undefined,
        preferredTime: preferredTime.trim() || undefined,
        lineItems,
        quoteExpiresAt: new Date(quoteExpiry).toISOString(),
      });
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

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, j) => j !== i));
  }

  function updateItem(i: number, field: keyof LineItemState, value: string | string[]) {
    setItems((prev) =>
      prev.map((li, j) => (j === i ? { ...li, [field]: value } : li)),
    );
  }

  function toggleAllergen(i: number, allergen: string) {
    const item = items[i];
    if (!item) return;
    const next = item.allergens.includes(allergen)
      ? item.allergens.filter((a) => a !== allergen)
      : [...item.allergens, allergen];
    updateItem(i, 'allergens', next);
  }

  const isExisting = Boolean(bookingId && existing);
  const canSend =
    isExisting && existing?.status === 'QUOTED' && !sendSuccess;

  const fieldLabel = 'mb-1 block text-sm font-medium';
  const input =
    'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="space-y-6">
      {isExisting && (
        <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-1">
          <p><strong>Customer:</strong> {existing?.customerName} ({existing?.customerEmail})</p>
          <p><strong>Status:</strong> {existing?.status}</p>
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
                onChange={(e) => setEventDate(e.target.value)}
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
              <label className={fieldLabel}>Quote expires at</label>
              <input
                type="datetime-local"
                className={input}
                value={quoteExpiry}
                onChange={(e) => setQuoteExpiry(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Line items */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Menu items</h2>
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
                  <label className={fieldLabel}>Description</label>
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
                  <label className={fieldLabel}>Quantity</label>
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
                  <label className={fieldLabel}>Unit price (£)</label>
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
                <label className={`${fieldLabel} text-xs text-muted-foreground`}>Allergens present in this item</label>
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
            <strong>{formatPounds(total)}</strong>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Deposit (25%)</span>
            <span>{formatPounds(deposit)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Balance</span>
            <span>{formatPounds(Math.max(0, total - deposit))}</span>
          </div>
        </div>

        {serverError && (
          <p className="text-sm text-destructive">{serverError}</p>
        )}

        <div className="flex gap-3">
          {!isExisting && (
            <button
              type="submit"
              disabled={create.isPending || total === 0}
              className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {create.isPending ? 'Saving…' : 'Save quote'}
            </button>
          )}
          {canSend && (
            <button
              type="button"
              onClick={handleSendQuote}
              disabled={send.isPending}
              className="rounded-md bg-green-600 px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {send.isPending ? 'Sending…' : 'Send quote to customer'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

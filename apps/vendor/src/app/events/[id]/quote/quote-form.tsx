'use client';

import {
  calculateCateringDeposit,
  calculateCateringQuoteExpiry,
  MINIMUM_CATERING_QUOTE_PENCE,
} from '@feastpot/config/catering-deposit';
import { Button, Input } from '@feastpot/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';

import { useSubmitVendorQuote, useVendorEventEnquiry } from '@/hooks/use-event-enquiries';

const formatPounds = (p: number | null | undefined) =>
  typeof p === 'number' ? `£${(p / 100).toFixed(2)}` : '-';

const fieldLabel = 'mb-1 block text-sm font-medium';
const textareaCls =
  'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

const toDatetimeLocal = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const defaultExpiry = () => {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return toDatetimeLocal(d);
};

export function QuoteForm({ enquiryId, accessToken }: { enquiryId: string; accessToken: string }) {
  const router = useRouter();
  const { data: enquiry, isLoading, error } = useVendorEventEnquiry(enquiryId, accessToken);
  const submit = useSubmitVendorQuote(enquiryId, accessToken);

  const [proposedMenu, setProposedMenu] = useState('');
  const [perHeadPounds, setPerHeadPounds] = useState('');
  const [deliveryPounds, setDeliveryPounds] = useState('0');
  const [minimumDepositPounds, setMinimumDepositPounds] = useState('0.00');
  const [terms, setTerms] = useState('');
  const [expiresAt, setExpiresAt] = useState(defaultExpiry());
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (enquiry?.quotes?.[0]) {
      const q = enquiry.quotes[0];
      setProposedMenu(q.proposedMenu ?? '');
      setPerHeadPounds((q.perHeadPence / 100).toFixed(2));
      setDeliveryPounds((q.deliveryFeePence / 100).toFixed(2));
      setMinimumDepositPounds((q.minimumDepositPence / 100).toFixed(2));
      setTerms(q.terms ?? '');
      if (q.expiresAt) {
        const d = new Date(q.expiresAt);
        const pad = (n: number) => String(n).padStart(2, '0');
        setExpiresAt(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
        );
      }
    }
  }, [enquiry]);

  const perHeadPence = Math.round(parseFloat(perHeadPounds || '0') * 100);
  const deliveryFeePence = Math.round(parseFloat(deliveryPounds || '0') * 100);
  const minimumDepositPence = Math.round(parseFloat(minimumDepositPounds || '0') * 100);
  const totalPence =
    (Number.isSafeInteger(perHeadPence) ? perHeadPence : 0) * (enquiry?.guestCount ?? 0) +
    (Number.isSafeInteger(deliveryFeePence) ? deliveryFeePence : 0);
  const hasValidMinimumDeposit =
    Number.isSafeInteger(minimumDepositPence) && minimumDepositPence >= 0;
  const hasValidPrices =
    Number.isSafeInteger(perHeadPence) &&
    perHeadPence >= 1 &&
    Number.isSafeInteger(deliveryFeePence) &&
    deliveryFeePence >= 0;
  const canSubmit =
    proposedMenu.trim().length > 0 &&
    hasValidPrices &&
    hasValidMinimumDeposit &&
    totalPence >= MINIMUM_CATERING_QUOTE_PENCE &&
    Boolean(expiresAt);
  const submitBlockReason = !proposedMenu.trim()
    ? 'Add a proposed menu to submit this quote.'
    : !hasValidPrices
      ? 'Enter a valid price per head and delivery fee.'
      : totalPence < MINIMUM_CATERING_QUOTE_PENCE
        ? 'Catering quote total must be at least £50.00.'
        : !hasValidMinimumDeposit
          ? 'Enter a valid minimum deposit amount.'
          : !expiresAt
            ? 'Choose when the quote expires.'
            : null;

  const depositPence = canSubmit
    ? calculateCateringDeposit(totalPence, minimumDepositPence).depositPence
    : 0;

  function clampExpiry(value: string): string {
    if (!value || !enquiry) return value;
    const maximum = calculateCateringQuoteExpiry(new Date(enquiry.eventDate));
    return new Date(value) > maximum ? toDatetimeLocal(maximum) : value;
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading enquiry…</p>;
  if (error || !enquiry)
    return <p className="text-sm text-destructive">Couldn&apos;t load enquiry.</p>;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    try {
      await submit.mutateAsync({
        proposedMenu: proposedMenu.trim(),
        perHeadPence,
        deliveryFeePence,
        minimumDepositPence,
        terms: terms || undefined,
        expiresAt: new Date(clampExpiry(expiresAt)).toISOString(),
      });
      router.push('/events');
    } catch (err) {
      setServerError((err as Error).message);
    }
  }

  return (
    <div>
      <Link href="/events" className="text-xs text-muted-foreground hover:underline">
        ← All event enquiries
      </Link>
      <header className="py-4">
        <h1 className="text-xl font-semibold capitalize">{enquiry.eventType}</h1>
        <dl className="mt-2 grid grid-cols-2 gap-1 text-sm text-muted-foreground">
          <div>
            <dt className="inline">Date: </dt>
            <dd className="inline">{new Date(enquiry.eventDate).toLocaleString('en-GB')}</dd>
          </div>
          <div>
            <dt className="inline">Guests: </dt>
            <dd className="inline">{enquiry.guestCount}</dd>
          </div>
          <div>
            <dt className="inline">Postcode: </dt>
            <dd className="inline">{enquiry.postcode}</dd>
          </div>
          <div>
            <dt className="inline">Budget: </dt>
            <dd className="inline">{formatPounds(enquiry.budgetPence)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="inline">Cuisines: </dt>
            <dd className="inline">{enquiry.cuisines.join(', ') || '-'}</dd>
          </div>
          <div className="col-span-2">
            <dt className="inline">Dietary: </dt>
            <dd className="inline">{enquiry.dietary.join(', ') || '-'}</dd>
          </div>
          {enquiry.notes && (
            <div className="col-span-2">
              <dt className="inline">Notes: </dt>
              <dd className="inline whitespace-pre-line">{enquiry.notes}</dd>
            </div>
          )}
        </dl>
      </header>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-card p-4">
        <label className="block">
          <span className={fieldLabel}>
            Proposed menu <span className="text-destructive">*</span>
          </span>
          <textarea
            className={textareaCls}
            rows={5}
            value={proposedMenu}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setProposedMenu(e.target.value)}
            placeholder="Per head: Jollof rice, Egusi soup, Pounded yam, Fried chicken, Small chops"
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={fieldLabel}>
              Price per head (£) <span className="text-destructive">*</span>
            </span>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={perHeadPounds}
              onChange={(e) => setPerHeadPounds(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className={fieldLabel}>Delivery fee (£)</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={deliveryPounds}
              onChange={(e) => setDeliveryPounds(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          <span className={fieldLabel}>
            Minimum deposit (£) <span className="text-destructive">*</span>
          </span>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={minimumDepositPounds}
            onChange={(e) => setMinimumDepositPounds(e.target.value)}
            required
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            We charge the greater of 25% or this amount, capped at the quote total.
          </span>
        </label>
        <label className="block">
          <span className={fieldLabel}>Terms (cancellation, final-numbers deadline…)</span>
          <textarea
            className={textareaCls}
            rows={3}
            value={terms}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setTerms(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>
            Quote valid until <span className="text-destructive">*</span>
          </span>
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(clampExpiry(e.target.value))}
            required
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            No later than seven days from now or 48 hours before the event, whichever is sooner.
          </span>
        </label>
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex justify-between">
            <span>Total</span>
            <strong>{formatPounds(totalPence)}</strong>
          </div>
          {canSubmit && (
            <div className="flex justify-between text-muted-foreground">
              <span>Deposit</span>
              <span>{formatPounds(depositPence)}</span>
            </div>
          )}
        </div>
        {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        <Button type="submit" className="w-full" disabled={submit.isPending || !canSubmit}>
          {submit.isPending ? 'Submitting…' : enquiry.quotes?.[0] ? 'Update quote' : 'Submit quote'}
        </Button>
        <p className="text-xs text-muted-foreground">
          <span className="text-destructive">*</span> Required field
        </p>
        {submitBlockReason && <p className="text-xs text-muted-foreground">{submitBlockReason}</p>}
      </form>
    </div>
  );
}

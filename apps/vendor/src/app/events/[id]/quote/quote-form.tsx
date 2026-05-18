'use client';

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

const defaultExpiry = () => {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function QuoteForm({ enquiryId, accessToken }: { enquiryId: string; accessToken: string }) {
  const router = useRouter();
  const { data: enquiry, isLoading, error } = useVendorEventEnquiry(enquiryId, accessToken);
  const submit = useSubmitVendorQuote(enquiryId, accessToken);

  const [proposedMenu, setProposedMenu] = useState('');
  const [perHeadPounds, setPerHeadPounds] = useState('');
  const [deliveryPounds, setDeliveryPounds] = useState('0');
  const [minDepositPct, setMinDepositPct] = useState(30);
  const [terms, setTerms] = useState('');
  const [expiresAt, setExpiresAt] = useState(defaultExpiry());
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (enquiry?.quotes?.[0]) {
      const q = enquiry.quotes[0];
      setProposedMenu(q.proposedMenu ?? '');
      setPerHeadPounds((q.perHeadPence / 100).toFixed(2));
      setDeliveryPounds((q.deliveryFeePence / 100).toFixed(2));
      setMinDepositPct(q.minDepositPct);
      setTerms(q.terms ?? '');
      if (q.expiresAt) {
        const d = new Date(q.expiresAt);
        const pad = (n: number) => String(n).padStart(2, '0');
        setExpiresAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
      }
    }
  }, [enquiry]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading enquiry…</p>;
  if (error || !enquiry) return <p className="text-sm text-destructive">Couldn&apos;t load enquiry.</p>;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    try {
      await submit.mutateAsync({
        proposedMenu: proposedMenu.trim(),
        perHeadPence: Math.round(parseFloat(perHeadPounds) * 100),
        deliveryFeePence: Math.round(parseFloat(deliveryPounds || '0') * 100),
        minDepositPct,
        terms: terms || undefined,
        expiresAt: new Date(expiresAt).toISOString(),
      });
      router.push('/events');
    } catch (err) {
      setServerError((err as Error).message);
    }
  }

  return (
    <div>
      <Link href="/events" className="text-xs text-muted-foreground hover:underline">← All event enquiries</Link>
      <header className="py-4">
        <h1 className="text-xl font-semibold capitalize">{enquiry.eventType}</h1>
        <dl className="mt-2 grid grid-cols-2 gap-1 text-sm text-muted-foreground">
          <div><dt className="inline">Date: </dt><dd className="inline">{new Date(enquiry.eventDate).toLocaleString('en-GB')}</dd></div>
          <div><dt className="inline">Guests: </dt><dd className="inline">{enquiry.guestCount}</dd></div>
          <div><dt className="inline">Postcode: </dt><dd className="inline">{enquiry.postcode}</dd></div>
          <div><dt className="inline">Budget: </dt><dd className="inline">{formatPounds(enquiry.budgetPence)}</dd></div>
          <div className="col-span-2"><dt className="inline">Cuisines: </dt><dd className="inline">{enquiry.cuisines.join(', ') || '-'}</dd></div>
          <div className="col-span-2"><dt className="inline">Dietary: </dt><dd className="inline">{enquiry.dietary.join(', ') || '-'}</dd></div>
          {enquiry.notes && <div className="col-span-2"><dt className="inline">Notes: </dt><dd className="inline whitespace-pre-line">{enquiry.notes}</dd></div>}
        </dl>
      </header>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-card p-4">
        <label className="block">
          <span className={fieldLabel}>Proposed menu</span>
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
            <span className={fieldLabel}>Price per head (£)</span>
            <Input type="number" step="0.01" min="0" value={perHeadPounds} onChange={(e) => setPerHeadPounds(e.target.value)} required />
          </label>
          <label className="block">
            <span className={fieldLabel}>Delivery fee (£)</span>
            <Input type="number" step="0.01" min="0" value={deliveryPounds} onChange={(e) => setDeliveryPounds(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className={fieldLabel}>Minimum deposit</span>
          <select
            value={minDepositPct}
            onChange={(e) => setMinDepositPct(Number(e.target.value))}
            className={textareaCls}
          >
            <option value={25}>25%</option>
            <option value={30}>30%</option>
            <option value={50}>50%</option>
          </select>
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
          <span className={fieldLabel}>Quote valid until</span>
          <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required />
        </label>
        {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        <Button type="submit" className="w-full" disabled={submit.isPending}>
          {submit.isPending ? 'Submitting…' : enquiry.quotes?.[0] ? 'Update quote' : 'Submit quote'}
        </Button>
      </form>
    </div>
  );
}

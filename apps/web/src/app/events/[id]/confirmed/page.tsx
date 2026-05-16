'use client';

import { Button, Input } from '@feastpot/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { PageShell } from '@/components/layout/page-shell';
import { useConfirmNumbers, useEventEnquiry } from '@/hooks/use-event-enquiries';

const formatPounds = (p: number | null | undefined) =>
  typeof p === 'number' ? `£${(p / 100).toFixed(2)}` : '—';

const fieldLabel = 'mb-1 block text-sm font-bold text-charcoal';
const textareaCls =
  'block w-full rounded-xl border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';

export default function ConfirmedPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data: enquiry, isLoading } = useEventEnquiry(id);
  const confirm = useConfirmNumbers(id);

  const [open, setOpen] = useState(false);
  const [guestCount, setGuestCount] = useState<number>(enquiry?.guestCount ?? 50);
  const [menuAdjustments, setMenuAdjustments] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  if (isLoading) return <PageShell><p className="py-8 text-center text-sm font-medium text-charcoal-mid">Loading…</p></PageShell>;
  if (!enquiry) return <PageShell><p className="py-8 text-center text-sm font-medium text-scotch">Not found.</p></PageShell>;

  const accepted = enquiry.quotes?.find((q) => q.status === 'accepted');
  const balanceDueAt = new Date(new Date(enquiry.eventDate).getTime() - 48 * 60 * 60 * 1000);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFeedback(null);
    try {
      await confirm.mutateAsync({ guestCount: Number(guestCount), menuAdjustments: menuAdjustments || undefined });
      setFeedback('Numbers confirmed. We\'ll prompt you 48h before the event for the balance.');
      setOpen(false);
    } catch (err) {
      setFeedback(`Failed to update: ${(err as Error).message}`);
    }
  }

  return (
    <PageShell>
      <Link href="/events" className="text-xs font-bold text-charcoal-mid hover:text-brand-dark hover:underline">← My events</Link>
      <header className="py-4">
        <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">Booking confirmed</h1>
        <p className="text-sm font-medium text-charcoal-mid">{enquiry.selectedVendor?.businessName ?? 'Your vendor'} is on it.</p>
      </header>

      <section className="space-y-2 rounded-2xl border border-cream-deep bg-white p-4 text-sm font-medium text-charcoal shadow-sm">
        <div className="flex justify-between"><span className="text-charcoal-mid">Event date</span><span>{new Date(enquiry.eventDate).toLocaleString('en-GB')}</span></div>
        <div className="flex justify-between"><span className="text-charcoal-mid">Final guests</span><span>{enquiry.finalGuestCount ?? enquiry.guestCount}</span></div>
        {accepted && (
          <>
            <div className="flex justify-between"><span className="text-charcoal-mid">Per head</span><span>{formatPounds(accepted.perHeadPence)}</span></div>
            <div className="flex justify-between"><span className="text-charcoal-mid">Delivery</span><span>{formatPounds(accepted.deliveryFeePence)}</span></div>
            <div className="flex justify-between border-t border-cream-deep pt-2 font-bold"><span>Total</span><span>{formatPounds(accepted.perHeadPence * (enquiry.finalGuestCount ?? enquiry.guestCount) + accepted.deliveryFeePence)}</span></div>
          </>
        )}
        <div className="flex justify-between"><span className="text-charcoal-mid">Balance due</span><span>{balanceDueAt.toLocaleString('en-GB')}</span></div>
      </section>

      {feedback && (
        <p className="mt-3 rounded-xl border border-brand/30 bg-brand/10 p-3 text-sm font-medium text-brand-dark">{feedback}</p>
      )}

      <Button className="mt-4 w-full rounded-xl bg-brand py-3 font-bold text-white hover:bg-brand-dark" onClick={() => setOpen((v) => !v)}>
        {open ? 'Cancel' : 'Confirm final numbers'}
      </Button>

      {open && (
        <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-2xl border border-cream-deep bg-white p-4 shadow-sm">
          <label className="block">
            <span className={fieldLabel}>Final guest count</span>
            <Input type="number" min={10} value={guestCount} onChange={(e) => setGuestCount(Number(e.target.value))} required />
          </label>
          <label className="block">
            <span className={fieldLabel}>Menu adjustments</span>
            <textarea
              className={textareaCls}
              rows={3}
              value={menuAdjustments}
              onChange={(e) => setMenuAdjustments(e.target.value)}
              placeholder="Any last-minute changes…"
            />
          </label>
          <Button type="submit" className="w-full rounded-xl bg-brand py-3 font-bold text-white hover:bg-brand-dark" disabled={confirm.isPending}>
            {confirm.isPending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      )}
    </PageShell>
  );
}

'use client';

import { Button, Input } from '@feastpot/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { PageShell } from '@/components/layout/page-shell';
import { useConfirmNumbers, useEventEnquiry } from '@/hooks/use-event-enquiries';

const formatPounds = (p: number | null | undefined) =>
  typeof p === 'number' ? `£${(p / 100).toFixed(2)}` : '—';

const fieldLabel = 'mb-1 block text-sm font-medium';
const textareaCls =
  'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

export default function ConfirmedPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data: enquiry, isLoading } = useEventEnquiry(id);
  const confirm = useConfirmNumbers(id);

  const [open, setOpen] = useState(false);
  const [guestCount, setGuestCount] = useState<number>(enquiry?.guestCount ?? 50);
  const [menuAdjustments, setMenuAdjustments] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  if (isLoading) return <PageShell><p className="py-8 text-center text-sm text-muted-foreground">Loading…</p></PageShell>;
  if (!enquiry) return <PageShell><p className="py-8 text-center text-sm text-destructive">Not found.</p></PageShell>;

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
      <Link href="/events" className="text-xs text-muted-foreground hover:underline">← My events</Link>
      <header className="py-4">
        <h1 className="text-xl font-semibold">Booking confirmed</h1>
        <p className="text-sm text-muted-foreground">{enquiry.selectedVendor?.businessName ?? 'Your vendor'} is on it.</p>
      </header>

      <section className="space-y-2 rounded-lg border bg-card p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Event date</span><span>{new Date(enquiry.eventDate).toLocaleString('en-GB')}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Final guests</span><span>{enquiry.finalGuestCount ?? enquiry.guestCount}</span></div>
        {accepted && (
          <>
            <div className="flex justify-between"><span className="text-muted-foreground">Per head</span><span>{formatPounds(accepted.perHeadPence)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{formatPounds(accepted.deliveryFeePence)}</span></div>
            <div className="flex justify-between font-medium"><span>Total</span><span>{formatPounds(accepted.perHeadPence * (enquiry.finalGuestCount ?? enquiry.guestCount) + accepted.deliveryFeePence)}</span></div>
          </>
        )}
        <div className="flex justify-between"><span className="text-muted-foreground">Balance due</span><span>{balanceDueAt.toLocaleString('en-GB')}</span></div>
      </section>

      {feedback && (
        <p className="mt-3 rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900">{feedback}</p>
      )}

      <Button className="mt-4 w-full" onClick={() => setOpen((v) => !v)}>
        {open ? 'Cancel' : 'Confirm final numbers'}
      </Button>

      {open && (
        <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-lg border bg-card p-4">
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
          <Button type="submit" className="w-full" disabled={confirm.isPending}>
            {confirm.isPending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      )}
    </PageShell>
  );
}

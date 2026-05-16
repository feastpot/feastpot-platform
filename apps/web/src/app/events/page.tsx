'use client';

import { Button } from '@feastpot/ui';
import Link from 'next/link';

import { PageShell } from '@/components/layout/page-shell';
import { useEventEnquiries } from '@/hooks/use-event-enquiries';

const STATUS_LABEL: Record<string, string> = {
  open: 'Awaiting quotes',
  quoted: 'Quotes received',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLOUR: Record<string, string> = {
  open: 'bg-plantain/20 text-plantain-dark',
  quoted: 'bg-brand-light text-brand-dark',
  confirmed: 'bg-brand/15 text-brand-dark',
  completed: 'bg-cream-deep text-charcoal-mid',
  cancelled: 'bg-scotch/10 text-scotch',
};

const formatPounds = (p: number | null | undefined) =>
  typeof p === 'number' ? `£${(p / 100).toFixed(2)}` : '—';

export default function EventsListPage() {
  const { data, isLoading, error } = useEventEnquiries();

  return (
    <PageShell>
      <header className="flex items-center justify-between py-4">
        <div>
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">My events</h1>
          <p className="text-sm text-charcoal-mid">Catering enquiries you&apos;ve sent.</p>
        </div>
        <Link href="/events/new">
          <Button>Plan a new event</Button>
        </Link>
      </header>

      {isLoading && <p className="py-8 text-center text-sm text-charcoal-mid">Loading…</p>}
      {error && <p className="py-8 text-center text-sm text-scotch">Couldn&apos;t load enquiries.</p>}

      {data && data.length === 0 && (
        <div className="space-y-2 rounded-2xl border border-dashed border-cream-deep bg-white p-6 text-center">
          <p className="text-sm text-charcoal-mid">No event enquiries yet.</p>
          <Link href="/events/new">
            <Button variant="outline">Send your first enquiry</Button>
          </Link>
        </div>
      )}

      <ul className="space-y-3">
        {data?.map((e) => (
          <li key={e.id}>
            <Link
              href={`/events/${e.id}`}
              className="block rounded-2xl border border-cream-deep bg-white p-4 shadow-sm transition hover:border-brand/40"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-bold capitalize text-charcoal">{e.eventType}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_COLOUR[e.status] ?? ''}`}>
                  {STATUS_LABEL[e.status] ?? e.status}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-charcoal-mid">
                <div><dt className="inline">Date: </dt><dd className="inline">{new Date(e.eventDate).toLocaleDateString('en-GB')}</dd></div>
                <div><dt className="inline">Guests: </dt><dd className="inline">{e.finalGuestCount ?? e.guestCount}</dd></div>
                <div><dt className="inline">Postcode: </dt><dd className="inline">{e.postcode}</dd></div>
                <div><dt className="inline">Budget: </dt><dd className="inline">{formatPounds(e.budgetPence)}</dd></div>
              </dl>
              {e.quotes && e.quotes.length > 0 && (
                <p className="mt-2 text-xs font-bold text-brand">{e.quotes.length} quote{e.quotes.length === 1 ? '' : 's'} received</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}

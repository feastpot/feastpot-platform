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
  open: 'bg-amber-100 text-amber-900',
  quoted: 'bg-blue-100 text-blue-900',
  confirmed: 'bg-emerald-100 text-emerald-900',
  completed: 'bg-zinc-100 text-zinc-700',
  cancelled: 'bg-rose-100 text-rose-900',
};

const formatPounds = (p: number | null | undefined) =>
  typeof p === 'number' ? `£${(p / 100).toFixed(2)}` : '—';

export default function EventsListPage() {
  const { data, isLoading, error } = useEventEnquiries();

  return (
    <PageShell>
      <header className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-xl font-semibold">My events</h1>
          <p className="text-sm text-muted-foreground">Catering enquiries you&apos;ve sent.</p>
        </div>
        <Link href="/events/new">
          <Button>Plan a new event</Button>
        </Link>
      </header>

      {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="py-8 text-center text-sm text-destructive">Couldn&apos;t load enquiries.</p>}

      {data && data.length === 0 && (
        <div className="space-y-2 rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">No event enquiries yet.</p>
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
              className="block rounded-lg border bg-card p-4 transition hover:border-foreground/30"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-medium capitalize">{e.eventType}</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOUR[e.status] ?? ''}`}>
                  {STATUS_LABEL[e.status] ?? e.status}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                <div><dt className="inline">Date: </dt><dd className="inline">{new Date(e.eventDate).toLocaleDateString('en-GB')}</dd></div>
                <div><dt className="inline">Guests: </dt><dd className="inline">{e.finalGuestCount ?? e.guestCount}</dd></div>
                <div><dt className="inline">Postcode: </dt><dd className="inline">{e.postcode}</dd></div>
                <div><dt className="inline">Budget: </dt><dd className="inline">{formatPounds(e.budgetPence)}</dd></div>
              </dl>
              {e.quotes && e.quotes.length > 0 && (
                <p className="mt-2 text-xs text-foreground/70">{e.quotes.length} quote{e.quotes.length === 1 ? '' : 's'} received</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}

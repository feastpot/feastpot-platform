'use client';

import Link from 'next/link';

import { useVendorEventEnquiries } from '@/hooks/use-event-enquiries';

const STATUS_LABEL: Record<string, string> = {
  open: 'New',
  quoted: 'Quoted',
  confirmed: 'Won',
  completed: 'Completed',
  cancelled: 'Closed',
};

export function EventsDashboard({ accessToken }: { accessToken: string }) {
  const { data, isLoading, error } = useVendorEventEnquiries(accessToken);

  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold">Event enquiries</h1>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Failed to load enquiries.</p>}
      {data && data.length === 0 && (
        <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
          No event enquiries matched to you yet.
        </p>
      )}
      <ul className="space-y-3">
        {data?.map((e) => {
          const youQuoted = (e.quotes ?? []).length > 0;
          const won = e.status === 'confirmed' && e.vendorId !== null;
          const label = won ? 'Won' : youQuoted && e.status === 'quoted' ? 'Quoted' : STATUS_LABEL[e.status] ?? e.status;
          return (
            <li key={e.id}>
              <Link href={`/events/${e.id}/quote`} className="block rounded-lg border bg-card p-4 hover:border-foreground/30">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium capitalize">{e.eventType} — {e.guestCount} guests</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{label}</span>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                  <div>{new Date(e.eventDate).toLocaleDateString('en-GB')}</div>
                  <div>{e.postcode}</div>
                  <div>{e.cuisines.join(', ') || '—'}</div>
                </dl>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

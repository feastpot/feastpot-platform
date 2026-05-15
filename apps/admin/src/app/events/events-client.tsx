'use client';

import {
  Badge,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import {
  useEventEnquiries,
  type EnquiryRow,
  type EnquiryStatus,
} from '@/hooks/use-event-enquiries';
import { formatDate, formatPence } from '@/lib/format';

const STATUSES: ReadonlyArray<EnquiryStatus | 'all'> = [
  'all',
  'open',
  'quoted',
  'confirmed',
  'completed',
  'cancelled',
  // D16: SLA-expired enquiries (no quote within 48h). Distinct from
  // 'cancelled' so support can spot vendor-responsiveness issues at a glance.
  'expired',
];

/**
 * Admin event-enquiry queue. Hits GET /v1/event-enquiries — that endpoint
 * already returns ALL enquiries unscoped when the caller has the admin
 * role, so a separate /admin/event-enquiries route is unnecessary.
 *
 * Read-only for now (admin can already nudge customers/vendors out-of-band
 * and intervene via /users + /vendors). Per-row deep-dive UI can land in
 * a follow-up if /events/[id] becomes a need.
 */
export function EventsClient() {
  const [status, setStatus] = useState<EnquiryStatus | 'all'>('all');
  const { data, isLoading, error } = useEventEnquiries({
    status: status === 'all' ? undefined : status,
  });

  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Event enquiries"
        description="Customer-submitted event briefs and the vendor quotes against them."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Select value={status} onValueChange={(v) => setStatus(v as EnquiryStatus | 'all')}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load enquiries: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Event date</TableHead>
                <TableHead className="text-right">Guests</TableHead>
                <TableHead>Postcode</TableHead>
                <TableHead>Cuisines</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Quotes</TableHead>
                <TableHead>Selected vendor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={10} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-6 text-center text-sm text-muted-foreground">
                    No enquiries match these filters.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((e) => (
                <EnquiryRowView key={e.id} row={e} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function EnquiryRowView({ row: e }: { row: EnquiryRow }) {
  const customerName =
    `${e.customer.firstName ?? ''} ${e.customer.lastName ?? ''}`.trim() || e.customer.email;
  const guests = e.finalGuestCount ?? e.guestCount;
  const cuisines = e.cuisines.length > 0 ? e.cuisines.join(', ') : '—';
  return (
    <TableRow>
      <TableCell className="text-sm">{formatDate(e.createdAt)}</TableCell>
      <TableCell className="text-sm">{customerName}</TableCell>
      <TableCell className="text-sm">{formatDate(e.eventDate)}</TableCell>
      <TableCell className="text-right text-sm">
        {guests}
        {e.finalGuestCount && e.finalGuestCount !== e.guestCount ? (
          <span className="ml-1 text-xs text-muted-foreground">(was {e.guestCount})</span>
        ) : null}
      </TableCell>
      <TableCell className="font-mono text-xs uppercase">{e.postcode}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{cuisines}</TableCell>
      <TableCell className="text-right text-sm">
        {e.budgetPence !== null ? formatPence(e.budgetPence) : '—'}
      </TableCell>
      <TableCell className="text-right text-sm">{e.quotes.length}</TableCell>
      <TableCell className="text-sm">{e.selectedVendor?.businessName ?? '—'}</TableCell>
      <TableCell>
        <StatusPill status={e.status} />
      </TableCell>
    </TableRow>
  );
}

function StatusPill({ status }: { status: EnquiryStatus }) {
  const styles: Record<EnquiryStatus, string> = {
    open: 'bg-amber-100 text-amber-900',
    quoted: 'bg-blue-100 text-blue-900',
    confirmed: 'bg-emerald-100 text-emerald-900',
    completed: 'bg-teal-light text-teal-dark',
    cancelled: 'bg-red-100 text-red-900',
    // Neutral grey to visually separate operational expiry from the red
    // 'cancelled' state — matches the spec's #444441/#F1EFE8 intent.
    expired: 'bg-stone-200 text-stone-800',
  };
  return <Badge className={styles[status]}>{status}</Badge>;
}

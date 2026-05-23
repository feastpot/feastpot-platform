'use client';

import {
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
import { CalendarHeart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterCard, FilterField } from '@/components/ui/filter-card';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
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

const STATUS_TONE: Record<EnquiryStatus, StatusTone> = {
  open: 'warning',
  quoted: 'info',
  confirmed: 'success',
  completed: 'success',
  cancelled: 'danger',
  expired: 'neutral',
};

/**
 * Admin event-enquiry queue. Hits GET /v1/event-enquiries - that endpoint
 * already returns ALL enquiries unscoped when the caller has the admin
 * role, so a separate /admin/event-enquiries route is unnecessary.
 *
 * Read-only for now (admin can already nudge customers/vendors out-of-band
 * and intervene via /users + /vendors). Per-row deep-dive UI can land in
 * a follow-up if /events/[id] becomes a need.
 */
export function EventsClient() {
  const router = useRouter();
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

      <FilterCard className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:max-w-xs">
          <FilterField label="Status">
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
          </FilterField>
        </div>
      </FilterCard>

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
                  <TableCell colSpan={10} className="p-0">
                    <EmptyState
                      icon={CalendarHeart}
                      title="No enquiries match these filters"
                      description="When customers submit catering briefs, they show up here."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((e) => (
                <EnquiryRowView
                  key={e.id}
                  row={e}
                  onOpen={() => router.push(`/events/${e.id}`)}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function EnquiryRowView({ row: e, onOpen }: { row: EnquiryRow; onOpen: () => void }) {
  const customerName =
    `${e.customer.firstName ?? ''} ${e.customer.lastName ?? ''}`.trim() || e.customer.email;
  const guests = e.finalGuestCount ?? e.guestCount;
  const cuisines = e.cuisines.length > 0 ? e.cuisines.join(', ') : '-';
  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={onOpen}
      // Keyboard parity for the click handler - `<TableRow>` renders a
      // <tr> which isn't focusable by default, so we make it tab-stoppable.
      tabIndex={0}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onOpen();
        }
      }}
    >
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
        {e.budgetPence !== null ? formatPence(e.budgetPence) : '-'}
      </TableCell>
      <TableCell className="text-right text-sm">{e.quotes.length}</TableCell>
      <TableCell className="text-sm">{e.selectedVendor?.businessName ?? '-'}</TableCell>
      <TableCell>
        <StatusPill tone={STATUS_TONE[e.status]}>{e.status}</StatusPill>
      </TableCell>
    </TableRow>
  );
}

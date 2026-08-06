'use client';

import { useState } from 'react';

type BookingStatus =
  | 'QUOTED'
  | 'DEPOSIT_PAID'
  | 'CONFIRMED'
  | 'BALANCE_PAID'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPence: number;
  allergens: string[];
}

interface CateringBooking {
  id: string;
  enquiryId: string;
  vendorId: string;
  customerEmail: string;
  customerName: string;
  eventDate: string;
  guestCount: number;
  eventAddress: string | null;
  preferredTime: string | null;
  totalPence: number;
  depositPence: number;
  balancePence: number;
  commissionPercent: string;
  commissionPence: number;
  attributionSource: string | null;
  status: BookingStatus;
  quoteExpiresAt: string;
  depositPaidAt: string | null;
  balancePaidAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  lineItems?: LineItem[];
  vendor?: { businessName: string; slug: string };
}

interface Props {
  accessToken: string;
  apiUrl: string;
}

const STATUS_COLOURS: Record<BookingStatus, string> = {
  QUOTED: 'bg-yellow-100 text-yellow-800',
  DEPOSIT_PAID: 'bg-blue-100 text-blue-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  BALANCE_PAID: 'bg-green-200 text-green-900',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  QUOTED: 'Quote sent',
  DEPOSIT_PAID: 'Deposit paid',
  CONFIRMED: 'Confirmed',
  BALANCE_PAID: 'Balance paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

function formatDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatPounds(p: number) {
  return `£${(p / 100).toFixed(2)}`;
}

export function CateringBookingsClient({ accessToken, apiUrl }: Props) {
  const [bookings, setBookings] = useState<CateringBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<CateringBooking | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  async function load(reset = false) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (statusFilter) params.set('status', statusFilter);
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await fetch(`${apiUrl}/v1/catering-bookings?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: CateringBooking[] = await res.json();
      setBookings((prev) => (reset ? data : [...prev, ...data]));
      setHasMore(data.length === 30);
      setCursor(data[data.length - 1]?.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // KPIs
  const totalValue = bookings.reduce((s, b) => s + b.totalPence, 0);
  const commission = bookings.reduce((s, b) => s + b.commissionPence, 0);
  const confirmed = bookings.filter((b) =>
    ['CONFIRMED', 'BALANCE_PAID', 'COMPLETED'].includes(b.status),
  ).length;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total bookings" value={String(bookings.length)} />
        <KpiCard label="Confirmed" value={String(confirmed)} />
        <KpiCard label="GMV" value={formatPounds(totalValue)} />
        <KpiCard label="Commission" value={formatPounds(commission)} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => { setCursor(undefined); load(true); }}
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Search'}
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Table */}
      {bookings.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Vendor</th>
                <th className="px-4 py-3 text-left">Event date</th>
                <th className="px-4 py-3 text-left">Guests</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Commission</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {bookings.map((b) => (
                <tr
                  key={b.id}
                  className="hover:bg-muted/20 cursor-pointer"
                  onClick={() => setSelected(b)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{b.customerName}</p>
                    <p className="text-xs text-muted-foreground">{b.customerEmail}</p>
                  </td>
                  <td className="px-4 py-3">{b.vendor?.businessName ?? '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(b.eventDate)}</td>
                  <td className="px-4 py-3 text-center">{b.guestCount}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatPounds(b.totalPence)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {formatPounds(b.commissionPence)}
                    <span className="ml-1 text-xs">({b.commissionPercent}%)</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[b.status] ?? ''}`}
                    >
                      {STATUS_LABELS[b.status] ?? b.status}
                    </span>
                    {b.attributionSource === 'VENDOR_REFERRED' && (
                      <span className="ml-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                        Referred
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelected(b); }}
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bookings.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">
          No bookings found. Click Search to load.
        </p>
      )}

      {hasMore && (
        <button
          onClick={() => load(false)}
          className="text-sm text-primary hover:underline"
        >
          Load more
        </button>
      )}

      {/* Detail panel */}
      {selected && <DetailPanel booking={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function DetailPanel({
  booking: b,
  onClose,
}: {
  booking: CateringBooking;
  onClose: () => void;
}) {
  const allAllergens = Array.from(
    new Set((b.lineItems ?? []).flatMap((li) => li.allergens)),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-background p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Booking detail</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            Close
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <Row label="Ref" value={b.id.slice(-12).toUpperCase()} />
          <Row label="Customer" value={`${b.customerName} (${b.customerEmail})`} />
          <Row label="Vendor" value={b.vendor?.businessName ?? b.vendorId} />
          <Row label="Event date" value={formatDate(b.eventDate)} />
          <Row label="Preferred time" value={b.preferredTime ?? '-'} />
          <Row label="Guests" value={String(b.guestCount)} />
          <Row label="Address" value={b.eventAddress ?? '-'} />
          <Row label="Status" value={STATUS_LABELS[b.status] ?? b.status} />
          <Row label="Attribution" value={b.attributionSource ?? 'MARKETPLACE'} />
          <Row label="Quote expires" value={formatDate(b.quoteExpiresAt)} />
          <Row label="Deposit paid" value={formatDate(b.depositPaidAt)} />
          <Row label="Balance paid" value={formatDate(b.balancePaidAt)} />
          <Row label="Completed" value={formatDate(b.completedAt)} />
          {b.cancelledAt && (
            <>
              <Row label="Cancelled" value={formatDate(b.cancelledAt)} />
              <Row label="Reason" value={b.cancellationReason ?? '-'} />
            </>
          )}

          <div className="border-t pt-4">
            <p className="font-semibold mb-2">Financials</p>
            <Row label="Total" value={formatPounds(b.totalPence)} />
            <Row label="Deposit (25%)" value={formatPounds(b.depositPence)} />
            <Row label="Balance" value={formatPounds(b.balancePence)} />
            <Row
              label="Commission"
              value={`${formatPounds(b.commissionPence)} (${b.commissionPercent}%)`}
            />
            <Row
              label="Vendor net"
              value={formatPounds(b.totalPence - b.commissionPence)}
            />
          </div>

          {(b.lineItems ?? []).length > 0 && (
            <div className="border-t pt-4">
              <p className="font-semibold mb-2">Menu items</p>
              {(b.lineItems ?? []).map((li) => (
                <div key={li.id} className="mb-2">
                  <p>
                    {li.quantity}x {li.description} -{' '}
                    {formatPounds(li.quantity * li.unitPence)}
                  </p>
                  {li.allergens.length > 0 && (
                    <p className="text-xs text-destructive">
                      Allergens: {li.allergens.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {allAllergens.length > 0 && (
            <div className="border-t pt-4">
              <p className="font-semibold mb-2">Allergen summary</p>
              <div className="flex flex-wrap gap-1">
                {allAllergens.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-36 shrink-0 font-medium text-muted-foreground">{label}</span>
      <span className="break-all">{value}</span>
    </div>
  );
}

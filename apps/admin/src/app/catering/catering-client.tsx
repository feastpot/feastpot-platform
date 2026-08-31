'use client';

import {
  Button,
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
import { AlertTriangle, CalendarHeart, CheckCircle, XCircle } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toaster';
import { useApi } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/use-debounce';
import { formatDateTime } from '@/lib/format';
import { getEnquiryUrgency } from '@/lib/catering-urgency';

// ── Types ──────────────────────────────────────────────────────────────────

interface CateringEnquiry {
  id: string;
  occasionType: string;
  guestCountBand: string;
  cuisineStyle?: string | null;
  postcode: string;
  outwardCode: string;
  eventDate?: string | null;
  preferredTime?: string | null;
  budgetBand?: string | null;
  contactName: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
  hearAboutUs?: string | null;
  status: string;
  adminNotes?: string | null;
  source?: string | null;
  createdAt: string;
  booking?: {
    id: string;
    status: string;
    vendorId: string;
    vendor?: { businessName: string; slug: string } | null;
  } | null;
}

interface ListPage {
  data: CateringEnquiry[];
  nextCursor: string | null;
}

interface EligibleVendor {
  id: string;
  businessName: string;
  slug: string;
  cuisines: string[];
  eventCateringManualQuote: boolean;
  area: {
    postcodes: string[];
    localRadiusMiles: number | null;
    latitude: number | null;
    longitude: number | null;
    kitchenPostcode: string | null;
  };
  coversArea: boolean;
}

type BookingStatus =
  | 'QUOTED'
  | 'DEPOSIT_PAID'
  | 'CONFIRMED'
  | 'BALANCE_PAID'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

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

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPence: number;
  allergens: string[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, StatusTone> = {
  NEW: 'info',
  QUALIFIED: 'warning',
  MATCHED: 'brand',
  ASSIGNED: 'brand',
  UNASSIGNED: 'neutral',
  WON: 'success',
  LOST: 'danger',
};

const STATUSES = ['NEW', 'UNASSIGNED', 'ASSIGNED', 'QUALIFIED', 'MATCHED', 'WON', 'LOST'];
const ASSIGNABLE_STATUSES = new Set(['NEW', 'UNASSIGNED']);

const BOOKING_STATUS_COLOURS: Record<BookingStatus, string> = {
  QUOTED: 'bg-yellow-100 text-yellow-800',
  DEPOSIT_PAID: 'bg-blue-100 text-blue-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  BALANCE_PAID: 'bg-green-200 text-green-900',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
};

const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  QUOTED: 'Quote sent',
  DEPOSIT_PAID: 'Deposit paid',
  CONFIRMED: 'Confirmed',
  BALANCE_PAID: 'Balance paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

const SLA_PILL_COLOURS: Record<'neutral' | 'amber' | 'red', string> = {
  neutral: 'bg-gray-100 text-gray-700',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800 font-semibold',
};

const EVENT_FLAG_COLOURS: Record<'amber' | 'red', string> = {
  amber: 'bg-amber-50 text-amber-700 border border-amber-200',
  red: 'bg-red-50 text-red-700 border border-red-200 font-semibold',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPounds(p: number) {
  return `£${(p / 100).toFixed(2)}`;
}

function formatBookingDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type Tab = 'enquiries' | 'bookings' | 'performance';

// ── Root component ─────────────────────────────────────────────────────────

export function CateringClient({
  role,
  accessToken,
  apiUrl,
  commissionFacts,
}: {
  role: string;
  accessToken: string;
  apiUrl: string;
  commissionFacts: { vendorReferred: number; marketplaceRepeat: number; marketplaceFirst: number };
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams?.get('tab') ?? 'enquiries';
  const tab: Tab = ['enquiries', 'bookings', 'performance'].includes(rawTab)
    ? (rawTab as Tab)
    : 'enquiries';

  function setTab(t: Tab) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('tab', t);
    router.replace(`/catering?${params.toString()}`, { scroll: false });
  }

  const TAB_LABELS: Record<Tab, string> = {
    enquiries: 'Enquiries',
    bookings: 'Bookings',
    performance: 'Performance',
  };

  return (
    <div>
      <PageHeader
        title="Catering"
        description="Enquiry triage, assigned bookings, and performance overview."
      />

      {/* Tab bar */}
      <div className="mb-6 flex border-b border-hairline">
        {(['enquiries', 'bookings', 'performance'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={[
              'px-5 py-2.5 text-sm font-medium transition-colors',
              tab === t
                ? 'border-b-2 border-brand text-brand'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'enquiries' && <EnquiriesTab />}
      {tab === 'bookings' && (
        <BookingsTab accessToken={accessToken} apiUrl={apiUrl} commissionFacts={commissionFacts} />
      )}
      {tab === 'performance' && <PerformanceTab />}
    </div>
  );
}

// ── Enquiries tab ──────────────────────────────────────────────────────────

function EnquiriesTab() {
  const { request } = useApi();
  const { toast } = useToast();

  const [status, setStatus] = useState('ALL');
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursorStack[cursorStack.length - 1];
  const [page, setPage] = useState<ListPage | null>(null);
  const [loading, setLoading] = useState(true);

  // Review panel
  const [reviewed, setReviewed] = useState<CateringEnquiry | null>(null);
  const [panelStatus, setPanelStatus] = useState('');
  const [panelNotes, setPanelNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Assign dialog - can be opened from row OR from the review panel
  const [assignTarget, setAssignTarget] = useState<CateringEnquiry | null>(null);
  const [assignMode, setAssignMode] = useState<'assign' | 'reassign'>('assign');
  const [vendorSearch, setVendorSearch] = useState('');
  const [eligibleVendors, setEligibleVendors] = useState<EligibleVendor[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [assignNote, setAssignNote] = useState('');
  const [assigning, setAssigning] = useState(false);
  const debouncedVendorSearch = useDebounce(vendorSearch);

  const loadPage = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== 'ALL') params.set('status', status);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', '50');
    request<ListPage>(`/catering-enquiries?${params.toString()}`)
      .then(setPage)
      .catch(() => setPage(null))
      .finally(() => setLoading(false));
  }, [request, status, cursor]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  // Load eligible vendors when assign dialog is open
  useEffect(() => {
    if (!assignTarget) return;
    setVendorLoading(true);
    const params = new URLSearchParams();
    if (debouncedVendorSearch.trim()) params.set('q', debouncedVendorSearch.trim());
    request<EligibleVendor[]>(
      `/catering-enquiries/${assignTarget.id}/eligible-vendors?${params.toString()}`,
    )
      .then(setEligibleVendors)
      .catch(() => setEligibleVendors([]))
      .finally(() => setVendorLoading(false));
  }, [assignTarget, debouncedVendorSearch, request]);

  const hasNext = Boolean(page?.nextCursor);
  const hasPrev = cursorStack.length > 1;

  function openReview(enq: CateringEnquiry) {
    setReviewed(enq);
    setPanelStatus(enq.status);
    setPanelNotes(enq.adminNotes ?? '');
    setAssignTarget(null);
    setVendorSearch('');
    setEligibleVendors([]);
    setSelectedVendorId('');
    setAssignNote('');
  }

  function openAssignDialog(enq: CateringEnquiry, mode: 'assign' | 'reassign') {
    setAssignTarget(enq);
    setAssignMode(mode);
    setVendorSearch('');
    setSelectedVendorId('');
    setAssignNote('');
  }

  async function savePanel() {
    if (!reviewed) return;
    setSaving(true);
    try {
      await request(`/catering-enquiries/${reviewed.id}`, {
        method: 'PATCH',
        body: { status: panelStatus, adminNotes: panelNotes },
      });
      toast({ title: 'Saved' });
      setReviewed(null);
      loadPage();
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function submitAssign() {
    if (!assignTarget || !selectedVendorId) return;
    setAssigning(true);
    const endpoint =
      assignMode === 'assign'
        ? `/catering-enquiries/${assignTarget.id}/assign`
        : `/catering-enquiries/${assignTarget.id}/reassign`;
    try {
      await request(endpoint, {
        method: 'POST',
        body: { vendorId: selectedVendorId, note: assignNote || undefined },
      });
      toast({ title: assignMode === 'assign' ? 'Enquiry assigned' : 'Enquiry reassigned' });
      setAssignTarget(null);
      setReviewed(null);
      loadPage();
    } catch (err: unknown) {
      const code = (err as { data?: { code?: string; message?: string } })?.data?.code;
      const msg = (err as { data?: { message?: string } })?.data?.message ?? 'Assignment failed';
      const detail =
        code === 'VENDOR_NOT_CATERING_CAPABLE'
          ? 'That vendor has not enabled catering quotes in their profile.'
          : code === 'VENDOR_NOT_LIVE'
            ? 'That vendor is not currently live.'
            : code === 'QUOTE_EXISTS_DECLINE_FIRST'
              ? 'The vendor has already submitted a quote - ask them to decline first.'
              : msg;
      toast({ title: 'Assignment failed', description: detail, variant: 'destructive' });
    } finally {
      setAssigning(false);
    }
  }

  // Sort enquiries by urgency: earliest deadline first.
  const sorted = [...(page?.data ?? [])].sort((a, b) => {
    const ua = getEnquiryUrgency(a.createdAt, a.eventDate);
    const ub = getEnquiryUrgency(b.createdAt, b.eventDate);
    return ua.urgencyDeadlineMs - ub.urgencyDeadlineMs;
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setCursorStack([undefined]);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={CalendarHeart}
          title="No catering enquiries"
          description="Public feast requests will appear here once customers submit the form."
        />
      ) : (
        <>
          <div className="rounded-xl border border-hairline bg-white shadow-sm overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Occasion</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Event date</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((enq) => {
                  const { sla, eventFlag } = getEnquiryUrgency(enq.createdAt, enq.eventDate);
                  return (
                    <TableRow key={enq.id}>
                      <TableCell>
                        <div>
                          <div className="text-sm font-medium">{enq.contactName}</div>
                          <div className="text-xs text-muted-foreground">{enq.email}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{enq.occasionType}</TableCell>
                      <TableCell className="text-sm tabular-nums">{enq.guestCountBand}</TableCell>
                      <TableCell className="font-mono text-sm">{enq.postcode}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="flex flex-col gap-1">
                          <span>{enq.eventDate ?? '-'}</span>
                          {eventFlag && (
                            <span
                              data-testid="event-flag"
                              data-tone={eventFlag.tone}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${EVENT_FLAG_COLOURS[eventFlag.tone]}`}
                            >
                              <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                              {eventFlag.label}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          data-testid="sla-pill"
                          data-tone={sla.tone}
                          className={`inline-block rounded-full px-2 py-0.5 text-xs ${SLA_PILL_COLOURS[sla.tone]}`}
                        >
                          {sla.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {enq.booking?.vendor?.businessName ? (
                          <span className="font-medium text-foreground">
                            {enq.booking.vendor.businessName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={STATUS_TONE[enq.status] ?? 'neutral'}>
                          {enq.status}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {ASSIGNABLE_STATUSES.has(enq.status) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAssignDialog(enq, 'assign')}
                            >
                              Assign
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => openReview(enq)}>
                            Review
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!hasPrev}
              onClick={() => setCursorStack((s) => s.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasNext}
              onClick={() => {
                if (page?.nextCursor) setCursorStack((s) => [...s, page.nextCursor!]);
              }}
            >
              Next
            </Button>
          </div>
        </>
      )}

      {/* Review side panel */}
      {reviewed && !assignTarget && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-hairline bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
            <h2 className="text-lg font-semibold">
              {reviewed.contactName}, {reviewed.occasionType}
            </h2>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setReviewed(null)}
            >
              &times;
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {reviewed.booking?.vendor && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                <span className="font-medium text-green-900">
                  Assigned to {reviewed.booking.vendor.businessName}
                </span>
                <span className="text-green-700 text-xs ml-auto capitalize">
                  {reviewed.booking.status.toLowerCase()}
                </span>
              </div>
            )}
            <dl className="divide-y divide-hairline text-sm">
              {(
                [
                  ['Email', reviewed.email],
                  ['Phone', reviewed.phone],
                  ['Guests', reviewed.guestCountBand],
                  ['Cuisine', reviewed.cuisineStyle],
                  ['Postcode', reviewed.postcode],
                  ['Event date', reviewed.eventDate],
                  ['Preferred time', reviewed.preferredTime],
                  ['Budget', reviewed.budgetBand],
                  ['Source', reviewed.source],
                  ['How heard', reviewed.hearAboutUs],
                  ['Received', formatDateTime(reviewed.createdAt)],
                ] as [string, string | null | undefined][]
              )
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
            </dl>
            {reviewed.notes && (
              <div>
                <p className="mb-1 text-sm font-medium">Customer notes</p>
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  {reviewed.notes}
                </p>
              </div>
            )}
            {ASSIGNABLE_STATUSES.has(reviewed.status) && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                <p className="mb-3 text-sm font-semibold text-orange-900">
                  Ready to assign to a vendor
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => openAssignDialog(reviewed, 'assign')}
                >
                  Assign to vendor
                </Button>
              </div>
            )}
            {reviewed.status === 'ASSIGNED' && reviewed.booking?.status === 'ASSIGNED' && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="mb-1 text-sm font-semibold text-blue-900">Assigned</p>
                <p className="mb-3 text-xs text-blue-700">
                  The vendor has not yet submitted a quote. You can reassign to a different vendor.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => openAssignDialog(reviewed, 'reassign')}
                >
                  Reassign to different vendor
                </Button>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium">Status</label>
              <Select value={panelStatus} onValueChange={setPanelStatus}>
                <SelectTrigger>
                  <SelectValue />
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
            <div>
              <label className="mb-1 block text-sm font-medium">Admin notes</label>
              <textarea
                className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={panelNotes}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPanelNotes(e.target.value)}
                placeholder="Internal notes visible only to staff..."
                rows={5}
              />
            </div>
          </div>
          <div className="border-t border-hairline px-6 py-4">
            <Button className="w-full" onClick={savePanel} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}

      {/* Assign dialog */}
      {assignTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="flex w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <div>
                <h3 className="text-base font-semibold">
                  {assignMode === 'assign' ? 'Assign vendor' : 'Reassign vendor'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {assignTarget.guestCountBand} guests &middot; {assignTarget.postcode} &middot;{' '}
                  {assignTarget.eventDate ?? 'date TBC'}
                </p>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setAssignTarget(null)}
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
              style={{ maxHeight: '60vh' }}
            >
              <div>
                <label className="mb-1 block text-sm font-medium">Search vendors</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Type to search catering-capable vendors..."
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {vendorLoading ? (
                <p className="text-sm text-muted-foreground">Loading vendors...</p>
              ) : eligibleVendors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No catering-capable live vendors found.{' '}
                  {vendorSearch ? 'Try a different search.' : ''}
                </p>
              ) : (
                <div className="space-y-2">
                  {eligibleVendors.map((v) => (
                    <label
                      key={v.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                        selectedVendorId === v.id
                          ? 'border-primary bg-primary/5'
                          : 'border-hairline hover:border-primary/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="vendor"
                        value={v.id}
                        checked={selectedVendorId === v.id}
                        onChange={() => setSelectedVendorId(v.id)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{v.businessName}</span>
                          {v.coversArea ? (
                            <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                              Covers area
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              Outside area
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {v.cuisines.join(', ') || 'No cuisine tags'}
                          {v.area.localRadiusMiles ? ` · ${v.area.localRadiusMiles}mi radius` : ''}
                          {v.area.kitchenPostcode ? ` · ${v.area.kitchenPostcode}` : ''}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Note to vendor{' '}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <textarea
                  className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  rows={3}
                  placeholder="Any context the vendor should know when quoting..."
                  value={assignNote}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setAssignNote(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 border-t border-hairline px-6 py-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setAssignTarget(null)}
                disabled={assigning}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!selectedVendorId || assigning}
                onClick={submitAssign}
              >
                {assigning
                  ? 'Assigning...'
                  : assignMode === 'assign'
                    ? 'Assign vendor'
                    : 'Reassign vendor'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bookings tab ───────────────────────────────────────────────────────────

function BookingsTab({
  accessToken,
  apiUrl,
  commissionFacts,
}: {
  accessToken: string;
  apiUrl: string;
  commissionFacts: { vendorReferred: number; marketplaceRepeat: number; marketplaceFirst: number };
}) {
  const [bookings, setBookings] = useState<CateringBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<CateringBooking | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (reset = false) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '30' });
        if (statusFilter) params.set('status', statusFilter);
        if (!reset && cursor) params.set('cursor', cursor);
        const res = await fetch(`${apiUrl}/v1/catering-bookings?${params.toString()}`, {
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
    },
    [accessToken, apiUrl, statusFilter, cursor],
  );

  // Auto-load on mount and whenever status filter changes.
  useEffect(() => {
    setCursor(undefined);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const totalValue = bookings.reduce((s, b) => s + b.totalPence, 0);
  const commission = bookings.reduce((s, b) => s + b.commissionPence, 0);
  const confirmed = bookings.filter((b) =>
    ['CONFIRMED', 'BALANCE_PAID', 'COMPLETED'].includes(b.status),
  ).length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Commission: referred = {commissionFacts.vendorReferred}%, marketplace repeat ={' '}
        {commissionFacts.marketplaceRepeat}%, marketplace first = {commissionFacts.marketplaceFirst}
        %.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BookingKpiCard label="Total loaded" value={String(bookings.length)} />
        <BookingKpiCard label="Confirmed" value={String(confirmed)} />
        <BookingKpiCard label="GMV" value={formatPounds(totalValue)} />
        <BookingKpiCard label="Commission" value={formatPounds(commission)} />
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {Object.entries(BOOKING_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

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
                  <td className="px-4 py-3 whitespace-nowrap">{formatBookingDate(b.eventDate)}</td>
                  <td className="px-4 py-3 text-center">{b.guestCount}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatPounds(b.totalPence)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {formatPounds(b.commissionPence)}
                    <span className="ml-1 text-xs">({b.commissionPercent}%)</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${BOOKING_STATUS_COLOURS[b.status] ?? ''}`}
                    >
                      {BOOKING_STATUS_LABELS[b.status] ?? b.status}
                    </span>
                    {b.attributionSource === 'VENDOR_REFERRED' && (
                      <span className="ml-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                        Referred
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(b);
                      }}
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
        <p className="text-sm text-muted-foreground">No bookings found for this filter.</p>
      )}

      {hasMore && (
        <button
          onClick={() => void load(false)}
          className="text-sm text-primary hover:underline"
          disabled={loading}
        >
          Load more
        </button>
      )}

      {selected && <BookingDetailPanel booking={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function BookingKpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function BookingDetailPanel({
  booking: b,
  onClose,
}: {
  booking: CateringBooking;
  onClose: () => void;
}) {
  const allAllergens = Array.from(new Set((b.lineItems ?? []).flatMap((li) => li.allergens)));
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
          <BRow label="Ref" value={b.id.slice(-12).toUpperCase()} />
          <BRow label="Customer" value={`${b.customerName} (${b.customerEmail})`} />
          <BRow label="Vendor" value={b.vendor?.businessName ?? b.vendorId} />
          <BRow label="Event date" value={formatBookingDate(b.eventDate)} />
          <BRow label="Preferred time" value={b.preferredTime ?? '-'} />
          <BRow label="Guests" value={String(b.guestCount)} />
          <BRow label="Address" value={b.eventAddress ?? '-'} />
          <BRow label="Status" value={BOOKING_STATUS_LABELS[b.status] ?? b.status} />
          <BRow label="Attribution" value={b.attributionSource ?? 'MARKETPLACE'} />
          <BRow label="Quote expires" value={formatBookingDate(b.quoteExpiresAt)} />
          <BRow label="Deposit paid" value={formatBookingDate(b.depositPaidAt)} />
          <BRow label="Balance paid" value={formatBookingDate(b.balancePaidAt)} />
          <BRow label="Completed" value={formatBookingDate(b.completedAt)} />
          {b.cancelledAt && (
            <>
              <BRow label="Cancelled" value={formatBookingDate(b.cancelledAt)} />
              <BRow label="Reason" value={b.cancellationReason ?? '-'} />
            </>
          )}
          <div className="border-t pt-4">
            <p className="font-semibold mb-2">Financials</p>
            <BRow label="Total" value={formatPounds(b.totalPence)} />
            <BRow label="Deposit" value={formatPounds(b.depositPence)} />
            <BRow label="Balance" value={formatPounds(b.balancePence)} />
            <BRow
              label="Commission"
              value={`${formatPounds(b.commissionPence)} (${b.commissionPercent}%)`}
            />
            <BRow label="Vendor net" value={formatPounds(b.totalPence - b.commissionPence)} />
          </div>
          {(b.lineItems ?? []).length > 0 && (
            <div className="border-t pt-4">
              <p className="font-semibold mb-2">Menu items</p>
              {(b.lineItems ?? []).map((li) => (
                <div key={li.id} className="mb-2">
                  <p>
                    {li.quantity}x {li.description} - {formatPounds(li.quantity * li.unitPence)}
                  </p>
                  {li.allergens.length > 0 && (
                    <p className="text-xs text-destructive">Allergens: {li.allergens.join(', ')}</p>
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

function BRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-36 shrink-0 font-medium text-muted-foreground">{label}</span>
      <span className="break-all">{value}</span>
    </div>
  );
}

// ── Performance tab ────────────────────────────────────────────────────────

function PerformanceTab() {
  const { request, ready } = useApi();
  const [enquiries, setEnquiries] = useState<CateringEnquiry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    request<ListPage>('/catering-enquiries?limit=200')
      .then((p) => setEnquiries(p.data))
      .catch(() => setEnquiries([]))
      .finally(() => setLoading(false));
  }, [ready, request]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const total = enquiries?.length ?? 0;
  const byCounts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = enquiries?.filter((e) => e.status === s).length ?? 0;
    return acc;
  }, {});
  const won = byCounts['WON'] ?? 0;
  const lost = byCounts['LOST'] ?? 0;
  const closedTotal = won + lost;
  const winRate = closedTotal > 0 ? ((won / closedTotal) * 100).toFixed(1) : '-';
  const unassignedOpen = (byCounts['NEW'] ?? 0) + (byCounts['UNASSIGNED'] ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PerfKpiCard label="Total enquiries (page)" value={String(total)} />
        <PerfKpiCard label="Unassigned" value={String(unassignedOpen)} />
        <PerfKpiCard
          label="Win rate (closed)"
          value={winRate === '-' ? 'No data' : `${winRate}%`}
        />
        <PerfKpiCard label="Won" value={String(won)} />
      </div>

      <div className="rounded-xl border border-hairline bg-white p-5">
        <h2 className="mb-4 text-sm font-bold">Enquiries by status</h2>
        <div className="space-y-2">
          {STATUSES.map((s) => {
            const count = byCounts[s] ?? 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={s} className="flex items-center gap-3 text-sm">
                <span className="w-24 text-muted-foreground">{s}</span>
                <div className="flex-1 rounded-full bg-muted/30 h-2">
                  <div
                    className="h-2 rounded-full bg-brand transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right tabular-nums text-muted-foreground">{count}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Showing most recent 200 enquiries. For full history, export from the Enquiries tab.
        </p>
      </div>
    </div>
  );
}

function PerfKpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

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
import { CalendarHeart, CheckCircle, XCircle } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toaster';
import { useApi } from '@/hooks/use-api';
import { formatDateTime } from '@/lib/format';

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

export function CateringEnquiriesClient() {
  const { request } = useApi();
  const { toast } = useToast();

  const [status, setStatus] = useState('ALL');
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursorStack[cursorStack.length - 1];
  const [page, setPage] = useState<ListPage | null>(null);
  const [loading, setLoading] = useState(true);

  // Detail panel
  const [selected, setSelected] = useState<CateringEnquiry | null>(null);
  const [panelStatus, setPanelStatus] = useState('');
  const [panelNotes, setPanelNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Assign dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<'assign' | 'reassign'>('assign');
  const [vendorSearch, setVendorSearch] = useState('');
  const [eligibleVendors, setEligibleVendors] = useState<EligibleVendor[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [assignNote, setAssignNote] = useState('');
  const [assigning, setAssigning] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const hasNext = Boolean(page?.nextCursor);
  const hasPrev = cursorStack.length > 1;

  function openPanel(enq: CateringEnquiry) {
    setSelected(enq);
    setPanelStatus(enq.status);
    setPanelNotes(enq.adminNotes ?? '');
    setAssignOpen(false);
    setVendorSearch('');
    setEligibleVendors([]);
    setSelectedVendorId('');
    setAssignNote('');
  }

  async function savePanel() {
    if (!selected) return;
    setSaving(true);
    try {
      await request(`/catering-enquiries/${selected.id}`, {
        method: 'PATCH',
        body: { status: panelStatus, adminNotes: panelNotes },
      });
      toast({ title: 'Saved' });
      setSelected(null);
      loadPage();
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  // Load eligible vendors when search changes
  useEffect(() => {
    if (!assignOpen || !selected) return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setVendorLoading(true);
      const params = new URLSearchParams();
      if (vendorSearch.trim()) params.set('q', vendorSearch.trim());
      request<EligibleVendor[]>(
        `/catering-enquiries/${selected.id}/eligible-vendors?${params.toString()}`,
      )
        .then(setEligibleVendors)
        .catch(() => setEligibleVendors([]))
        .finally(() => setVendorLoading(false));
    }, 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [assignOpen, vendorSearch, selected, request]);

  function openAssignDialog(mode: 'assign' | 'reassign') {
    setAssignMode(mode);
    setAssignOpen(true);
    setVendorSearch('');
    setSelectedVendorId('');
    setAssignNote('');
  }

  async function submitAssign() {
    if (!selected || !selectedVendorId) return;
    setAssigning(true);
    const endpoint =
      assignMode === 'assign'
        ? `/catering-enquiries/${selected.id}/assign`
        : `/catering-enquiries/${selected.id}/reassign`;
    try {
      await request(endpoint, {
        method: 'POST',
        body: { vendorId: selectedVendorId, note: assignNote || undefined },
      });
      toast({ title: assignMode === 'assign' ? 'Enquiry assigned' : 'Enquiry reassigned' });
      setAssignOpen(false);
      setSelected(null);
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

  return (
    <div>
      <PageHeader
        title="Catering Enquiries"
        description="Public feast requests from the /catering form. Assign to a vendor within 48 hours."
      />

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
      ) : (page?.data ?? []).length === 0 ? (
        <EmptyState
          icon={CalendarHeart}
          title="No catering enquiries"
          description="Public feast requests will appear here once customers submit the form."
        />
      ) : (
        <>
          <div className="rounded-xl border border-hairline bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Occasion</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(page?.data ?? []).map((enq) => (
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
                      {enq.eventDate ?? '-'}
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
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(enq.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openPanel(enq)}>
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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

      {/* Detail side panel */}
      {selected && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-hairline bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
            <h2 className="text-lg font-semibold">
              {selected.contactName}, {selected.occasionType}
            </h2>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setSelected(null)}
            >
              &times;
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Assigned vendor chip */}
            {selected.booking?.vendor && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                <span className="font-medium text-green-900">
                  Assigned to {selected.booking.vendor.businessName}
                </span>
                <span className="text-green-700 text-xs ml-auto capitalize">
                  {selected.booking.status.toLowerCase()}
                </span>
              </div>
            )}

            <dl className="divide-y divide-hairline text-sm">
              {[
                ['Email', selected.email],
                ['Phone', selected.phone],
                ['Guests', selected.guestCountBand],
                ['Cuisine', selected.cuisineStyle],
                ['Postcode', selected.postcode],
                ['Event date', selected.eventDate],
                ['Preferred time', selected.preferredTime],
                ['Budget', selected.budgetBand],
                ['Source', selected.source],
                ['How heard', selected.hearAboutUs],
                ['Received', formatDateTime(selected.createdAt)],
              ]
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label as string} className="flex justify-between py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
            </dl>
            {selected.notes && (
              <div>
                <p className="mb-1 text-sm font-medium">Customer notes</p>
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  {selected.notes}
                </p>
              </div>
            )}

            {/* Assign / Reassign action */}
            {ASSIGNABLE_STATUSES.has(selected.status) && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                <p className="mb-3 text-sm font-semibold text-orange-900">
                  Ready to assign to a vendor
                </p>
                <Button size="sm" className="w-full" onClick={() => openAssignDialog('assign')}>
                  Assign to vendor
                </Button>
              </div>
            )}
            {selected.status === 'ASSIGNED' && selected.booking?.status === 'ASSIGNED' && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="mb-1 text-sm font-semibold text-blue-900">Assigned</p>
                <p className="mb-3 text-xs text-blue-700">
                  The vendor has not yet submitted a quote. You can reassign to a different vendor.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => openAssignDialog('reassign')}
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

      {/* Assign dialog overlay */}
      {assignOpen && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="flex w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <div>
                <h3 className="text-base font-semibold">
                  {assignMode === 'assign' ? 'Assign vendor' : 'Reassign vendor'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selected.guestCountBand} guests &middot; {selected.postcode} &middot;{' '}
                  {selected.eventDate ?? 'date TBC'}
                </p>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setAssignOpen(false)}
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div
              className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
              style={{ maxHeight: '60vh' }}
            >
              {/* Vendor search */}
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

              {/* Vendor list */}
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
                          {v.area.localRadiusMiles
                            ? ` &middot; ${v.area.localRadiusMiles}mi radius`
                            : ''}
                          {v.area.kitchenPostcode ? ` &middot; ${v.area.kitchenPostcode}` : ''}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Note */}
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
                onClick={() => setAssignOpen(false)}
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

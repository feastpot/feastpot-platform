'use client';

import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
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
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Filter,
  Info,
  MessageSquare,
  Pause,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import {
  useModerateReview,
  useReviewsQueue,
  useReviewsQueueCounts,
  type ModerationQueueFilter,
  type ModerationQueueRow,
  type ModerationStatus,
} from '@/hooks/use-reviews-queue';
import { formatDate } from '@/lib/format';

const PAGE_LIMIT = 25;

const REJECT_REASON_MIN = 10;
const REJECT_REASON_MAX = 500;

const STATUS_TONE: Record<ModerationStatus, StatusTone> = {
  approved: 'success',
  auto_approved: 'success',
  rejected: 'danger',
  held: 'warning',
};

const STATUS_LABEL: Record<ModerationStatus, string> = {
  approved: 'Approved',
  auto_approved: 'Auto approved',
  rejected: 'Rejected',
  held: 'Held',
};

interface QuickFilter {
  value: ModerationQueueFilter;
  label: string;
  toneClasses: string; // count badge colour when active
}

const QUICK_FILTERS: ReadonlyArray<QuickFilter> = [
  { value: 'all', label: 'All', toneClasses: 'bg-foreground text-background' },
  { value: 'auto_approved', label: 'Auto approved', toneClasses: 'bg-teal text-white' },
  { value: 'held', label: 'Held', toneClasses: 'bg-brand text-brand-foreground' },
  { value: 'approved', label: 'Approved', toneClasses: 'bg-teal text-white' },
  { value: 'rejected', label: 'Rejected', toneClasses: 'bg-destructive text-destructive-foreground' },
];

const STATUS_OPTIONS: ReadonlyArray<{ value: ModerationQueueFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'auto_approved', label: 'Auto approved' },
  { value: 'held', label: 'Held' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const RATING_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'all', label: 'All ratings' },
  { value: '5', label: '5 stars' },
  { value: '4', label: '4 stars' },
  { value: '3', label: '3 stars' },
  { value: '2', label: '2 stars' },
  { value: '1', label: '1 star' },
];

interface QueueFiltersState {
  status: ModerationQueueFilter;
  q: string;
  rating: string;
  submittedFrom: string;
  submittedTo: string;
}

const DEFAULT_FILTERS: QueueFiltersState = {
  status: 'all',
  q: '',
  rating: 'all',
  submittedFrom: '',
  submittedTo: '',
};

export function ReviewsQueueClient() {
  const [filters, setFilters] = useState<QueueFiltersState>(DEFAULT_FILTERS);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const cursor = cursorStack[cursorStack.length - 1] ?? null;
  const pageIndex = cursorStack.length - 1;

  const apiFilters = useMemo(
    () => ({
      status: filters.status,
      q: filters.q,
      rating: filters.rating === 'all' ? undefined : Number(filters.rating),
      submittedFrom: filters.submittedFrom || undefined,
      submittedTo: filters.submittedTo || undefined,
    }),
    [filters],
  );

  const list = useReviewsQueue({ ...apiFilters, cursor, limit: PAGE_LIMIT });
  // Counts respect every filter EXCEPT status (server strips it). That way
  // changing the rating / search / dates re-counts each status against the
  // narrowed set, matching the wireframe's chip behaviour.
  const counts = useReviewsQueueCounts(apiFilters);

  const moderate = useModerateReview();
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<ModerationQueueRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const nextCursor = list.data?.nextCursor ?? null;

  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.q.trim().length > 0 ||
    filters.rating !== 'all' ||
    filters.submittedFrom.length > 0 ||
    filters.submittedTo.length > 0;

  function update<K extends keyof QueueFiltersState>(key: K, value: QueueFiltersState[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setCursorStack([null]);
  }

  function clearAll() {
    setFilters(DEFAULT_FILTERS);
    setCursorStack([null]);
  }

  function setStatusChip(value: ModerationQueueFilter) {
    update('status', value);
  }

  async function moderateOnce(
    row: ModerationQueueRow,
    status: 'approved' | 'rejected' | 'held',
    reason?: string,
  ) {
    if (inFlight.has(row.id)) return;
    setInFlight((prev) => new Set(prev).add(row.id));
    try {
      await moderate.mutateAsync({ id: row.id, status, reason });
    } finally {
      setInFlight((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  function openRejectDialog(row: ModerationQueueRow) {
    setRejectTarget(row);
    setRejectReason('');
  }
  function closeRejectDialog() {
    setRejectTarget(null);
    setRejectReason('');
  }
  async function confirmReject() {
    if (!rejectTarget) return;
    const trimmed = rejectReason.trim();
    if (trimmed.length < REJECT_REASON_MIN || trimmed.length > REJECT_REASON_MAX) return;
    const target = rejectTarget;
    closeRejectDialog();
    await moderateOnce(target, 'rejected', trimmed);
  }
  const reasonLength = rejectReason.trim().length;
  const reasonValid = reasonLength >= REJECT_REASON_MIN && reasonLength <= REJECT_REASON_MAX;

  const showingFrom = rows.length === 0 ? 0 : pageIndex * PAGE_LIMIT + 1;
  const showingTo = rows.length === 0 ? 0 : Math.min(pageIndex * PAGE_LIMIT + rows.length, total);
  const rangeLabel = showingFrom === showingTo ? `${showingTo}` : `${showingFrom} to ${showingTo}`;

  const countFor = (k: ModerationQueueFilter): number | undefined => {
    if (!counts.data) return undefined;
    if (k === 'all') return counts.data.all;
    return counts.data[k];
  };

  return (
    <>
      <PageHeader
        title="Reviews moderation"
        description="Review and manage customer feedback to maintain trust and quality."
        actions={
          <Button
            variant="outline"
            disabled={total === 0}
            title={total === 0 ? 'Nothing to export' : 'Export current filter as CSV (coming soon)'}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        }
      />

      {/* Quick-filter chips with live counts */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {QUICK_FILTERS.map((q) => {
          const active = filters.status === q.value;
          const n = countFor(q.value);
          return (
            <button
              key={q.value}
              type="button"
              onClick={() => setStatusChip(q.value)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              }`}
              aria-pressed={active}
            >
              <span>{q.label}</span>
              <span
                className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                  active ? q.toneClasses : 'bg-muted text-foreground/70'
                }`}
              >
                {n ?? '–'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter row */}
      <Card className="mb-4">
        <CardContent className="grid grid-cols-1 gap-3 py-4 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search reviews, vendors…"
                value={filters.q}
                onChange={(e) => update('q', e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Select value="all" disabled>
            <SelectTrigger title="Filter by vendor name via the search box on the left">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.rating} onValueChange={(v) => update('rating', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATING_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.status}
            onValueChange={(v) => update('status', v as ModerationQueueFilter)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={filters.submittedFrom}
              onChange={(e) => update('submittedFrom', e.target.value)}
              aria-label="Submitted from"
              className="text-xs"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={filters.submittedTo}
              onChange={(e) => update('submittedTo', e.target.value)}
              aria-label="Submitted to"
              className="text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              disabled
              title="More filters coming soon"
              aria-label="More filters"
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
        {hasActiveFilters && (
          <div className="flex items-center justify-end border-t border-border px-4 py-2">
            <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Clear all
            </Button>
          </div>
        )}
      </Card>

      {list.error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load reviews: {(list.error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!list.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={MessageSquare}
                      title="No reviews match these filters"
                      description="Try a different status tab or clear the search."
                      action={
                        hasActiveFilters ? <Button onClick={clearAll}>Clear filters</Button> : null
                      }
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <ReviewRowView
                  key={r.id}
                  row={r}
                  busy={inFlight.has(r.id)}
                  onApprove={() => moderateOnce(r, 'approved')}
                  onReject={() => openRejectDialog(r)}
                  onHold={() => moderateOnce(r, 'held')}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>

        {/* Pagination footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Showing {total === 0 ? 0 : rangeLabel} of {total} {total === 1 ? 'review' : 'reviews'}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursorStack((s) => s.slice(0, -1))}
              disabled={pageIndex === 0 || list.isFetching}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="grid h-8 min-w-8 place-items-center rounded-md bg-brand px-2 text-xs font-semibold text-brand-foreground">
              {pageIndex + 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => nextCursor && setCursorStack((s) => [...s, nextCursor])}
              disabled={!nextCursor || list.isFetching}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => list.refetch()}
              disabled={list.isFetching}
              aria-label="Refresh"
              title="Refresh"
              className="ml-2"
            >
              <RefreshCw className={`h-4 w-4 ${list.isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Moderation tip footer */}
      <Card className="mt-4 border-teal/30 bg-teal-light/40">
        <CardContent className="flex items-start gap-3 py-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-dark" aria-hidden="true" />
          <div>
            <div className="font-semibold text-teal-dark">Moderation tip</div>
            <div className="text-muted-foreground">
              Reviews in &lsquo;Held&rsquo; need your attention. Approve good reviews and reject
              harmful or inappropriate content.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reject-reason dialog */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeRejectDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject review</DialogTitle>
            <DialogDescription>
              This review will be hidden from the vendor&apos;s profile and the rating recalculated.
              A reason is required for the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={`Reason for rejection (min ${REJECT_REASON_MIN} characters)`}
              maxLength={REJECT_REASON_MAX}
              className="min-h-[96px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm font-[inherit] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span
                className={
                  reasonLength > 0 && reasonLength < REJECT_REASON_MIN ? 'text-destructive' : ''
                }
              >
                {reasonLength < REJECT_REASON_MIN
                  ? `${REJECT_REASON_MIN - reasonLength} more character${REJECT_REASON_MIN - reasonLength === 1 ? '' : 's'} needed`
                  : 'Looks good'}
              </span>
              <span>
                {reasonLength}/{REJECT_REASON_MAX}
              </span>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={closeRejectDialog}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!reasonValid}
              onClick={confirmReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirm rejection
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReviewRowView({
  row: r,
  busy,
  onApprove,
  onReject,
  onHold,
}: {
  row: ModerationQueueRow;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onHold: () => void;
}) {
  const customerName =
    `${r.customer.firstName ?? ''} ${r.customer.lastName?.[0] ?? ''}`.trim() || r.customer.email;
  const vendorInitials = r.vendor.businessName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const submitted = new Date(r.createdAt);
  const cuisine = r.vendor.cuisines[0] ?? null;
  const isHeld = r.moderationStatus === 'held';
  const isApproved =
    r.moderationStatus === 'approved' || r.moderationStatus === 'auto_approved';
  const isRejected = r.moderationStatus === 'rejected';

  return (
    <TableRow>
      <TableCell className="text-sm">
        <div>{formatDate(r.createdAt)}</div>
        <div className="text-xs text-muted-foreground">
          {submitted.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-light text-xs font-bold text-brand-dark">
            {r.vendor.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.vendor.logoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              vendorInitials
            )}
          </div>
          <div className="min-w-0">
            <Link
              href={`/vendors/${r.vendor.id}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {r.vendor.businessName}
            </Link>
            {cuisine && (
              <div className="text-xs text-muted-foreground">{cuisine}</div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <span
            className="text-amber-500"
            aria-label={`${r.rating} out of 5`}
            role="img"
          >
            {'★'.repeat(r.rating)}
            <span className="text-muted-foreground/30">
              {'★'.repeat(Math.max(0, 5 - r.rating))}
            </span>
          </span>
          <span className="text-xs font-medium tabular-nums text-foreground">
            {r.rating.toFixed(1)}
          </span>
        </div>
      </TableCell>
      <TableCell className="max-w-md text-sm">
        {r.title && <div className="font-medium">{r.title}</div>}
        <div className="text-muted-foreground">
          {r.body || <span className="italic">(no comment)</span>}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">by {customerName}</div>
      </TableCell>
      <TableCell>
        <StatusPill tone={STATUS_TONE[r.moderationStatus]}>
          {STATUS_LABEL[r.moderationStatus]}
        </StatusPill>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Link
            href={`/vendors/${r.vendor.id}`}
            className="inline-grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted"
            title="View vendor"
            aria-label="View vendor"
          >
            <Eye className="h-4 w-4" />
          </Link>
          {!isApproved && (
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="inline-grid h-8 w-8 place-items-center rounded-md border border-teal/40 text-teal-dark hover:bg-teal-light disabled:opacity-50"
              title={isHeld ? 'Release (approve)' : 'Approve'}
              aria-label="Approve"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          {!isHeld && !isRejected && (
            <button
              type="button"
              onClick={onHold}
              disabled={busy}
              className="inline-grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
              title="Push back to held queue"
              aria-label="Hold"
            >
              <Pause className="h-4 w-4" />
            </button>
          )}
          {!isRejected && (
            <button
              type="button"
              onClick={onReject}
              disabled={busy}
              className="inline-grid h-8 w-8 place-items-center rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
              title="Reject"
              aria-label="Reject"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

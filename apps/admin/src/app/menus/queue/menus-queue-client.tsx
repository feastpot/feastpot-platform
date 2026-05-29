'use client';

import { Button, Card, CardContent, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@feastpot/ui';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Pause,
  RefreshCw,
  Search,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import {
  useMenuModerationCounts,
  useMenuModerationQueue,
  useModerateMenuItem,
  type MenuModerationFilter,
  type MenuModerationRow,
  type MenuModerationStatus,
} from '@/hooks/use-menu-moderation';
import { formatDate, formatPence } from '@/lib/format';

const PAGE_LIMIT = 25;

const STATUS_TONE: Record<MenuModerationStatus, StatusTone> = {
  approved: 'success',
  auto_approved: 'success',
  rejected: 'danger',
  held: 'warning',
};

const STATUS_LABEL: Record<MenuModerationStatus, string> = {
  approved: 'Approved',
  auto_approved: 'Auto approved',
  rejected: 'Rejected',
  held: 'Pending',
};

interface QuickFilter {
  value: MenuModerationFilter;
  label: string;
  toneClasses: string;
}

const QUICK_FILTERS: ReadonlyArray<QuickFilter> = [
  { value: 'all', label: 'All', toneClasses: 'bg-foreground text-background' },
  { value: 'held', label: 'Pending', toneClasses: 'bg-brand text-brand-foreground' },
  { value: 'approved', label: 'Approved', toneClasses: 'bg-teal text-white' },
  { value: 'auto_approved', label: 'Auto approved', toneClasses: 'bg-teal text-white' },
  { value: 'rejected', label: 'Rejected', toneClasses: 'bg-destructive text-destructive-foreground' },
];

interface QueueFiltersState {
  status: MenuModerationFilter;
  q: string;
}

const DEFAULT_FILTERS: QueueFiltersState = { status: 'held', q: '' };

export function MenusQueueClient() {
  const [filters, setFilters] = useState<QueueFiltersState>(DEFAULT_FILTERS);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const cursor = cursorStack[cursorStack.length - 1] ?? null;
  const pageIndex = cursorStack.length - 1;

  const apiFilters = useMemo(() => ({ status: filters.status, q: filters.q }), [filters]);

  const list = useMenuModerationQueue({ ...apiFilters, cursor, limit: PAGE_LIMIT });
  // Counts respect the search filter but ignore status (server strips it), so
  // each chip shows how many items sit in that status under the current search.
  const counts = useMenuModerationCounts({ q: filters.q });

  const moderate = useModerateMenuItem();
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const nextCursor = list.data?.nextCursor ?? null;

  const hasActiveFilters = filters.status !== 'held' || filters.q.trim().length > 0;

  function update<K extends keyof QueueFiltersState>(key: K, value: QueueFiltersState[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setCursorStack([null]);
  }

  function clearAll() {
    setFilters(DEFAULT_FILTERS);
    setCursorStack([null]);
  }

  async function moderateOnce(row: MenuModerationRow, status: 'approved' | 'rejected' | 'held') {
    if (inFlight.has(row.id)) return;
    setInFlight((prev) => new Set(prev).add(row.id));
    try {
      await moderate.mutateAsync({ id: row.id, status });
    } finally {
      setInFlight((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  const showingFrom = rows.length === 0 ? 0 : pageIndex * PAGE_LIMIT + 1;
  const showingTo = rows.length === 0 ? 0 : Math.min(pageIndex * PAGE_LIMIT + rows.length, total);
  const rangeLabel = showingFrom === showingTo ? `${showingTo}` : `${showingFrom} to ${showingTo}`;

  const countFor = (k: MenuModerationFilter): number | undefined => {
    if (!counts.data) return undefined;
    if (k === 'all') return counts.data.all;
    return counts.data[k];
  };

  return (
    <>
      <PageHeader
        title="Menu moderation"
        description="Approve or reject vendor menu items before they appear to customers."
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
              onClick={() => update('status', q.value)}
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
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search items, vendors…"
              value={filters.q}
              onChange={(e) => update('q', e.target.value)}
              className="pl-9"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Clear all
            </Button>
          )}
        </CardContent>
      </Card>

      {list.error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load menu items: {(list.error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Price</TableHead>
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
                      icon={UtensilsCrossed}
                      title="No menu items match these filters"
                      description="Try a different status tab or clear the search."
                      action={hasActiveFilters ? <Button onClick={clearAll}>Clear filters</Button> : null}
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <MenuItemRowView
                  key={r.id}
                  row={r}
                  busy={inFlight.has(r.id)}
                  onApprove={() => moderateOnce(r, 'approved')}
                  onReject={() => moderateOnce(r, 'rejected')}
                  onHold={() => moderateOnce(r, 'held')}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>

        {/* Pagination footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Showing {total === 0 ? 0 : rangeLabel} of {total} {total === 1 ? 'item' : 'items'}
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
              Items marked &lsquo;Pending&rsquo; are hidden from customers until approved. Approve
              safe listings and reject anything inaccurate or inappropriate.
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function MenuItemRowView({
  row: r,
  busy,
  onApprove,
  onReject,
  onHold,
}: {
  row: MenuModerationRow;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onHold: () => void;
}) {
  const thumb = r.imageUrls?.[0] ?? null;
  const vendorInitials = (r.vendor?.businessName ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const submitted = new Date(r.createdAt);
  const isHeld = r.moderationStatus === 'held';
  const isApproved = r.moderationStatus === 'approved' || r.moderationStatus === 'auto_approved';
  const isRejected = r.moderationStatus === 'rejected';

  return (
    <TableRow>
      <TableCell className="text-sm">
        <div>{formatDate(r.createdAt)}</div>
        <div className="text-xs text-muted-foreground">
          {submitted.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </TableCell>
      <TableCell className="max-w-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <UtensilsCrossed className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{r.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {r.description || <span className="italic">(no description)</span>}
            </div>
            <div className="text-xs text-muted-foreground">{r.category}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-light text-xs font-bold text-brand-dark">
            {r.vendor.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.vendor.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              vendorInitials
            )}
          </div>
          <Link
            href={`/vendors/${r.vendor.id}`}
            className="block min-w-0 truncate text-sm font-medium hover:underline"
          >
            {r.vendor.businessName}
          </Link>
        </div>
      </TableCell>
      <TableCell className="text-right text-sm font-medium tabular-nums">
        {formatPence(r.pricePence)}
      </TableCell>
      <TableCell>
        <StatusPill tone={STATUS_TONE[r.moderationStatus]}>
          {STATUS_LABEL[r.moderationStatus]}
        </StatusPill>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
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
              title="Push back to pending queue"
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
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

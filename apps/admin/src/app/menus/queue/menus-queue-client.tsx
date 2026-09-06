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
  Info,
  Loader2,
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
  useBulkApproveMenuItems,
  type MenuModerationFilter,
  type MenuModerationRow,
  type MenuModerationStatus,
} from '@/hooks/use-menu-moderation';
import { useDebounce } from '@/hooks/use-debounce';
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
  {
    value: 'rejected',
    label: 'Rejected',
    toneClasses: 'bg-destructive text-destructive-foreground',
  },
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

  // Debounce the full filter object. Raw `filters` keeps inputs instant; only
  // the query key and count key are held back.
  const debouncedFilters = useDebounce(filters);
  const apiFilters = useMemo(
    () => ({ status: debouncedFilters.status, q: debouncedFilters.q }),
    [debouncedFilters],
  );

  const list = useMenuModerationQueue({ ...apiFilters, cursor, limit: PAGE_LIMIT });
  // Counts respect the search filter but ignore status (server strips it), so
  // each chip shows how many items sit in that status under the current search.
  const counts = useMenuModerationCounts({ q: debouncedFilters.q });

  const moderate = useModerateMenuItem();
  const bulkApprove = useBulkApproveMenuItems();
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ type: 'reject' | 'edit'; row: MenuModerationRow } | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [editForm, setEditForm] = useState({ name: '', description: '', price: '' });

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const nextCursor = list.data?.nextCursor ?? null;

  const hasActiveFilters = filters.status !== 'auto_approved' || filters.q.trim().length > 0;

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
      await moderate.mutateAsync({
        id: row.id,
        status,
        expectedSubmissionVersion: row.submissionVersion,
        expectedStatus: row.moderationStatus,
      });
      setActionError(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'The moderation action failed. Try again.',
      );
    } finally {
      setInFlight((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  function openEdit(row: MenuModerationRow) {
    setEditForm({
      name: row.name,
      description: row.description ?? '',
      price: String(row.pricePence / 100),
    });
    setDialog({ type: 'edit', row });
  }

  async function submitDialog() {
    if (!dialog) return;
    if (dialog.type === 'reject' && !reason.trim()) return;
    setInFlight((prev) => new Set(prev).add(dialog.row.id));
    try {
      if (dialog.type === 'reject') {
        await moderate.mutateAsync({
          id: dialog.row.id,
          status: 'rejected',
          reason: reason.trim(),
          expectedSubmissionVersion: dialog.row.submissionVersion,
          expectedStatus: dialog.row.moderationStatus,
        });
      } else {
        await moderate.mutateAsync({
          id: dialog.row.id,
          status: 'approved',
          expectedSubmissionVersion: dialog.row.submissionVersion,
          expectedStatus: dialog.row.moderationStatus,
          edits: {
            name: editForm.name.trim(),
            description: editForm.description.trim(),
            basePricePence: Math.round(Number(editForm.price) * 100),
          },
        });
      }
      setDialog(null);
      setReason('');
      setActionError(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'The moderation action failed. Try again.',
      );
    } finally {
      setInFlight((prev) => {
        const next = new Set(prev);
        next.delete(dialog.row.id);
        return next;
      });
    }
  }

  const selectedRows = rows.filter((row) => selected.has(row.id));
  const selectedVendor = selectedRows[0]?.vendorId;
  const canBulkApprove =
    selectedRows.length > 0 &&
    selectedRows.every((row) => row.vendorId === selectedVendor && row.moderationStatus === 'held');

  async function bulkApproveSelected() {
    if (!selectedVendor || !canBulkApprove) return;
    try {
      await bulkApprove.mutateAsync({
        vendorId: selectedVendor,
        items: selectedRows.map((row) => ({
          id: row.id,
          expectedSubmissionVersion: row.submissionVersion,
        })),
      });
      setSelected(new Set());
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Bulk approval failed. Try again.');
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
        description="A focused safety queue for items waiting on a fast, accountable decision."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/20 bg-brand-light/30 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Launch watch</div>
          <div className="text-xs text-muted-foreground">
            Prioritise overdue submissions. Bulk approval is limited to one vendor at a time.
          </div>
        </div>
        <Button
          size="sm"
          onClick={bulkApproveSelected}
          disabled={!canBulkApprove || bulkApprove.isPending}
        >
          {bulkApprove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Approve {selectedRows.length || ''} selected
        </Button>
      </div>
      {actionError && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-3 py-3 text-sm text-destructive">
            <span>{actionError}</span>
            <Button variant="ghost" size="sm" onClick={() => setActionError(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

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
                <TableHead>
                  <span className="sr-only">Select</span>
                </TableHead>
                <TableHead>Submitted / SLA</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
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
                      action={
                        hasActiveFilters ? <Button onClick={clearAll}>Clear filters</Button> : null
                      }
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <MenuItemRowView
                  key={r.id}
                  row={r}
                  selected={selected.has(r.id)}
                  onSelect={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    })
                  }
                  busy={inFlight.has(r.id)}
                  onApprove={() => moderateOnce(r, 'approved')}
                  onReject={() => {
                    setReason(r.moderationReason ?? '');
                    setDialog({ type: 'reject', row: r });
                  }}
                  onEdit={() => openEdit(r)}
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

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.type === 'reject' ? 'Reject menu item' : 'Approve with edits'}
            </DialogTitle>
            <DialogDescription>
              {dialog?.type === 'reject'
                ? 'This reason is shown to the vendor. Keep it specific and actionable.'
                : 'Make the small correction, then approve the item for launch.'}
            </DialogDescription>
          </DialogHeader>
          {dialog?.type === 'reject' ? (
            <div className="mt-5 space-y-2">
              <label className="text-sm font-medium" htmlFor="moderation-reason">
                Vendor-visible reason
              </label>
              <textarea
                id="moderation-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
                placeholder="Explain what needs to change…"
              />
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium">
                Item name
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </label>
              <label className="block text-sm font-medium">
                Description
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="mt-1 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-medium">
                Price (£)
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                />
              </label>
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={dialog?.type === 'reject' ? 'destructive' : 'default'}
              onClick={submitDialog}
              disabled={
                (!!dialog && inFlight.has(dialog.row.id)) ||
                (dialog?.type === 'reject' && !reason.trim())
              }
            >
              {dialog && inFlight.has(dialog.row.id) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {dialog?.type === 'reject' ? 'Reject item' : 'Approve with edits'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Moderation policy footer */}
      <Card className="mt-4 border-teal/30 bg-teal-light/40">
        <CardContent className="flex items-start gap-3 py-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-dark" aria-hidden="true" />
          <div>
            <div className="font-semibold text-teal-dark">Manual pilot approval is active</div>
            <div className="text-muted-foreground">
              New menu items and substantive edits remain hidden until an admin approves them.
              Prioritise held items approaching the 72-hour target and give rejected items a clear,
              vendor-visible reason.
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
  selected,
  onSelect,
  onApprove,
  onReject,
  onEdit,
  onHold,
}: {
  row: MenuModerationRow;
  busy: boolean;
  selected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onHold: () => void;
}) {
  const thumb = r.imageUrls?.[0] ?? null;
  const vendorInitials = (r.vendor?.businessName ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const submitted = new Date(r.moderationSubmittedAt ?? r.createdAt);
  const isHeld = r.moderationStatus === 'held';
  const isApproved = r.moderationStatus === 'approved' || r.moderationStatus === 'auto_approved';
  const isRejected = r.moderationStatus === 'rejected';
  const overdue = r.isOverdue || (r.slaDueAt ? new Date(r.slaDueAt).getTime() < Date.now() : false);

  return (
    <TableRow>
      <TableCell>
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label={`Select ${r.name}`}
          disabled={!isHeld || busy}
          className="h-4 w-4 rounded border-border accent-brand"
        />
      </TableCell>
      <TableCell className="text-sm">
        <div>{formatDate(r.moderationSubmittedAt ?? r.createdAt)}</div>
        <div className="text-xs text-muted-foreground">
          {submitted.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div
          className={`mt-1 text-xs font-medium ${overdue ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {overdue ? 'Overdue' : r.slaDueAt ? `Due ${formatDate(r.slaDueAt)}` : 'SLA pending'}
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
          {!isApproved && !isRejected && (
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              className="rounded-md border border-brand/40 px-2 text-xs font-medium text-brand-dark hover:bg-brand-light disabled:opacity-50"
            >
              Edit
            </button>
          )}
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

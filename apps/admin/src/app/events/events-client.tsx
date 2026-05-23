'use client';

import {
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  DropdownMenuTrigger,
} from '@feastpot/ui';
import {
  CalendarHeart,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Filter,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import {
  useEventEnquiries,
  type EnquiryRow,
  type EnquiryStatus,
} from '@/hooks/use-event-enquiries';
import { formatDate, formatPence } from '@/lib/format';

const PAGE_LIMIT = 25;

const STATUS_LABEL: Record<EnquiryStatus, string> = {
  open: 'New',
  quoted: 'Quoted',
  confirmed: 'Booked',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Escalated',
};

const STATUS_TONE: Record<EnquiryStatus, StatusTone> = {
  open: 'warning',
  quoted: 'info',
  confirmed: 'success',
  completed: 'success',
  cancelled: 'danger',
  expired: 'danger',
};

const QUICK_FILTERS: ReadonlyArray<{ value: EnquiryStatus; label: string; tone: StatusTone }> = [
  { value: 'open', label: 'New', tone: 'warning' },
  { value: 'quoted', label: 'Quoted', tone: 'info' },
  { value: 'confirmed', label: 'Booked', tone: 'success' },
  { value: 'completed', label: 'Completed', tone: 'success' },
  { value: 'cancelled', label: 'Cancelled', tone: 'neutral' },
  { value: 'expired', label: 'Escalated', tone: 'danger' },
];

const STATUS_OPTIONS: ReadonlyArray<{ value: EnquiryStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  ...QUICK_FILTERS.map((q) => ({ value: q.value, label: q.label })),
];

const BUDGET_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  min?: number;
  max?: number;
}> = [
  { value: 'all', label: 'All budgets' },
  { value: 'lt-1000', label: 'Under £1,000', max: 100_000 },
  { value: '1000-3000', label: '£1,000–£3,000', min: 100_000, max: 300_000 },
  { value: '3000-5000', label: '£3,000–£5,000', min: 300_000, max: 500_000 },
  { value: '5000-10000', label: '£5,000–£10,000', min: 500_000, max: 1_000_000 },
  { value: 'gt-10000', label: 'Over £10,000', min: 1_000_000 },
];

interface AdminFilters {
  status: EnquiryStatus | 'all';
  q: string;
  eventFrom: string;
  eventTo: string;
  createdFrom: string;
  createdTo: string;
  budget: string;
}

const DEFAULT_FILTERS: AdminFilters = {
  status: 'all',
  q: '',
  eventFrom: '',
  eventTo: '',
  createdFrom: '',
  createdTo: '',
  budget: 'all',
};

export function EventsClient() {
  const router = useRouter();
  const [filters, setFilters] = useState<AdminFilters>(DEFAULT_FILTERS);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const cursor = cursorStack[cursorStack.length - 1] ?? null;
  const pageIndex = cursorStack.length - 1;

  const budget = BUDGET_OPTIONS.find((b) => b.value === filters.budget) ?? BUDGET_OPTIONS[0];
  const list = useEventEnquiries({
    status: filters.status,
    q: filters.q,
    eventFrom: filters.eventFrom || undefined,
    eventTo: filters.eventTo || undefined,
    createdFrom: filters.createdFrom || undefined,
    createdTo: filters.createdTo || undefined,
    budgetMin: budget?.min,
    budgetMax: budget?.max,
    cursor,
    limit: PAGE_LIMIT,
  });

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const nextCursor = list.data?.nextCursor ?? null;

  const hasActiveFilters = useMemo(
    () =>
      filters.status !== 'all' ||
      filters.q.trim().length > 0 ||
      filters.eventFrom.length > 0 ||
      filters.eventTo.length > 0 ||
      filters.createdFrom.length > 0 ||
      filters.createdTo.length > 0 ||
      filters.budget !== 'all',
    [filters],
  );

  function update<K extends keyof AdminFilters>(key: K, value: AdminFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setCursorStack([null]);
  }

  function clearAll() {
    setFilters(DEFAULT_FILTERS);
    setCursorStack([null]);
  }

  function setStatusChip(s: EnquiryStatus | 'all') {
    update('status', s);
  }

  const showingFrom = rows.length === 0 ? 0 : pageIndex * PAGE_LIMIT + 1;
  const showingTo = rows.length === 0 ? 0 : Math.min(pageIndex * PAGE_LIMIT + rows.length, total);
  const rangeLabel = showingFrom === showingTo ? `${showingTo}` : `${showingFrom} to ${showingTo}`;

  return (
    <>
      <PageHeader
        title="Event enquiries"
        description="Customer-submitted event briefs and vendor quotes against them."
        actions={
          <>
            <Button
              variant="outline"
              disabled={total === 0}
              title={total === 0 ? 'Nothing to export' : 'Export current filter as CSV (coming soon)'}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button disabled title="New enquiries are created by customers via /events/new">
              <Plus className="mr-2 h-4 w-4" />
              New enquiry
            </Button>
          </>
        }
      />

      {/* Filter row */}
      <Card className="mb-4">
        <CardContent className="grid grid-cols-1 gap-3 py-4 md:grid-cols-12">
          <FilterField label="View" className="md:col-span-2">
            <Select value="all" disabled>
              <SelectTrigger>
                <SelectValue placeholder="All enquiries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All enquiries</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Status" className="md:col-span-2">
            <Select
              value={filters.status}
              onValueChange={(v) => update('status', v as EnquiryStatus | 'all')}
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
          </FilterField>

          <FilterField label="Event date" className="md:col-span-3">
            <DateRangeInputs
              from={filters.eventFrom}
              to={filters.eventTo}
              onFrom={(v) => update('eventFrom', v)}
              onTo={(v) => update('eventTo', v)}
            />
          </FilterField>

          <FilterField label="Created date" className="md:col-span-3">
            <DateRangeInputs
              from={filters.createdFrom}
              to={filters.createdTo}
              onFrom={(v) => update('createdFrom', v)}
              onTo={(v) => update('createdTo', v)}
            />
          </FilterField>

          <FilterField label="Budget" className="md:col-span-2">
            <Select value={filters.budget} onValueChange={(v) => update('budget', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUDGET_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label=" " className="md:col-span-12">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search customer / postcode…"
                  value={filters.q}
                  onChange={(e) => update('q', e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                disabled
                aria-label="More filters (coming soon)"
                title="More filters coming soon"
              >
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </FilterField>
        </CardContent>

        {/* Quick filter chips + Clear all */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quick filters:
          </span>
          {QUICK_FILTERS.map((q) => {
            const active = filters.status === q.value;
            return (
              <button
                key={q.value}
                type="button"
                onClick={() => setStatusChip(active ? 'all' : q.value)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-brand bg-brand text-brand-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted'
                }`}
              >
                {q.label}
              </button>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={!hasActiveFilters}
            className="ml-auto text-muted-foreground"
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Clear all
          </Button>
        </div>
      </Card>

      {/* Error */}
      {list.error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load enquiries: {(list.error as Error).message}
          </CardContent>
        </Card>
      )}

      {/* Table */}
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
                <TableHead>Budget</TableHead>
                <TableHead className="text-right">Quotes</TableHead>
                <TableHead>Selected vendor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading && (
                <TableRow>
                  <TableCell colSpan={11} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!list.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="p-0">
                    <EmptyState
                      icon={CalendarHeart}
                      title="No enquiries match these filters"
                      description="When customers submit catering briefs, they show up here."
                      action={
                        hasActiveFilters ? <Button onClick={clearAll}>Clear filters</Button> : null
                      }
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

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Showing {total === 0 ? 0 : rangeLabel} of {total} {total === 1 ? 'enquiry' : 'enquiries'}
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
    </>
  );
}

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ''}`}>
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label === ' ' ? '\u00A0' : label}
      </label>
      {children}
    </div>
  );
}

function DateRangeInputs({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Input
        type="date"
        value={from}
        onChange={(e) => onFrom(e.target.value)}
        aria-label="From"
        className="min-w-0 flex-1 px-2 text-xs"
      />
      <span className="shrink-0 text-xs text-muted-foreground">–</span>
      <Input
        type="date"
        value={to}
        onChange={(e) => onTo(e.target.value)}
        aria-label="To"
        className="min-w-0 flex-1 px-2 text-xs"
      />
    </div>
  );
}

function EnquiryRowView({ row: e, onOpen }: { row: EnquiryRow; onOpen: () => void }) {
  const customerName =
    `${e.customer.firstName ?? ''} ${e.customer.lastName ?? ''}`.trim() || e.customer.email;
  const initials =
    `${(e.customer.firstName ?? e.customer.email)[0] ?? '?'}${(e.customer.lastName ?? '')[0] ?? ''}`.toUpperCase();
  const guests = e.finalGuestCount ?? e.guestCount;
  const cuisineMain = e.cuisines[0] ?? '—';
  const cuisineOverflow = e.cuisines.length > 1 ? `+${e.cuisines.length - 1}` : null;
  const vendorInitials = e.selectedVendor
    ? e.selectedVendor.businessName
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '';

  function handleRowClick(ev: React.MouseEvent) {
    // Don't navigate when interacting with the row actions menu
    if ((ev.target as HTMLElement).closest('[data-row-action]')) return;
    onOpen();
  }

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={handleRowClick}
      tabIndex={0}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onOpen();
        }
      }}
    >
      <TableCell className="text-sm">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <div>
            <div>{formatDate(e.createdAt)}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(e.createdAt).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-light text-xs font-bold text-teal-dark">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium leading-tight">{customerName}</div>
            <div className="text-xs text-muted-foreground">{e.customer.email}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm">
        <div className="flex items-center gap-2">
          <CalendarHeart className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <div>
            <div>{formatDate(e.eventDate)}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(e.eventDate).toLocaleTimeString('en-GB', {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {guests}
        {e.finalGuestCount && e.finalGuestCount !== e.guestCount ? (
          <span className="ml-1 text-xs text-muted-foreground">(was {e.guestCount})</span>
        ) : null}
      </TableCell>
      <TableCell className="font-mono text-xs uppercase">{e.postcode}</TableCell>
      <TableCell className="text-sm">
        <div className="flex items-center gap-1.5">
          <span>{cuisineMain}</span>
          {cuisineOverflow && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {cuisineOverflow}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm tabular-nums">
        {e.budgetPence !== null ? formatPence(e.budgetPence) : '—'}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">{e.quotes.length}</TableCell>
      <TableCell className="text-sm">
        {e.selectedVendor ? (
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-light text-xs font-bold text-brand-dark">
              {vendorInitials}
            </div>
            <span className="truncate">{e.selectedVendor.businessName}</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-teal" aria-hidden="true" />
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <StatusPill tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</StatusPill>
      </TableCell>
      <TableCell className="text-right" data-row-action>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Enquiry actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={onOpen}>Open</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

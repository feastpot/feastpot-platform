'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
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
  AlertTriangle,
  Download,
  MoreHorizontal,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterCard, FilterField } from '@/components/ui/filter-card';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import {
  useDisputes,
  useDisputeStats,
  type DisputeFilters,
  type DisputeRow,
  type DisputeStatus,
  type Severity,
  type SlaFilter,
} from '@/hooks/use-disputes';
import { formatDate, formatPence } from '@/lib/format';
import { getSLAStatus, SLA_TONE_CLASSES, type SLAStatus } from '@/lib/sla';

// -- enums + label maps ------------------------------------------------------
//
// Honest deviation from the wireframe: the wireframe shows Status options
// "Open / In Progress / Pending" and a Severity chip "Critical". Our Prisma
// schema only models statuses `open|vendor_contacted|escalated|resolved|closed`
// and severities `low|medium|high`. Rather than fake an enum value, we expose
// the real ones with friendly labels and skip the Critical chip.

const STATUSES: ReadonlyArray<DisputeStatus | 'all'> = [
  'all',
  'open',
  'vendor_contacted',
  'escalated',
  'resolved',
  'closed',
];
const STATUS_LABEL: Record<DisputeStatus | 'all', string> = {
  all: 'All statuses',
  open: 'Open',
  vendor_contacted: 'In progress',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};
const STATUS_TONE: Record<DisputeStatus, StatusTone> = {
  open: 'info',
  vendor_contacted: 'info',
  escalated: 'danger',
  resolved: 'success',
  closed: 'neutral',
};

const SEVERITY_CHIPS: ReadonlyArray<{ value: Severity | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];
const SEVERITY_TONE: Record<Severity, StatusTone> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
};

const SLA_OPTIONS: ReadonlyArray<{ value: SlaFilter; label: string }> = [
  { value: 'all', label: 'All SLAs' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'breaching_soon', label: 'Breaching soon' },
  { value: 'on_track', label: 'On track' },
  { value: 'resolved', label: 'Resolved' },
];

type DateRange = '7d' | '30d' | '90d' | 'all';
const DATE_OPTIONS: ReadonlyArray<{ value: DateRange; label: string }> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];
function dateRangeToCreatedFrom(range: DateRange): string | undefined {
  if (range === 'all') return undefined;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

// -- component ---------------------------------------------------------------

export function DisputesClient() {
  const [status, setStatus] = useState<DisputeStatus | 'all'>('all');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [sla, setSla] = useState<SlaFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);

  // Pagination via cursor stack: each entry is the cursor that produced
  // page N. Page 0 has cursor `undefined`. "Next" pushes; "Prev" pops.
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursorStack[cursorStack.length - 1];
  const pageIndex = cursorStack.length - 1;

  const filters: DisputeFilters = useMemo(
    () => ({
      status: status === 'all' ? undefined : status,
      severities: severity === 'all' ? undefined : [severity],
      sla,
      q: search.trim() || undefined,
      createdFrom: dateRangeToCreatedFrom(dateRange),
      cursor,
      limit: pageSize,
    }),
    [status, severity, sla, search, dateRange, cursor, pageSize],
  );
  // Stats share the filter scope minus pagination.
  const statsFilters = useMemo(
    () => ({
      status: filters.status,
      severities: filters.severities,
      sla: filters.sla,
      q: filters.q,
      createdFrom: filters.createdFrom,
      createdTo: filters.createdTo,
    }),
    [filters],
  );

  const { data, isLoading, error } = useDisputes(filters);
  const { data: stats } = useDisputeStats(statsFilters);

  // SLA-aware reordering: surface breaches first, then oldest open disputes.
  const rows = useMemo(
    () =>
      (data?.data ?? [])
        .map((d) => ({ d, sla: getSLAStatus(d.createdAt, d.vendorRespondedAt, d.resolvedAt) }))
        .sort((a, b) => {
          if (a.sla.urgent !== b.sla.urgent) return a.sla.urgent ? -1 : 1;
          return new Date(a.d.createdAt).getTime() - new Date(b.d.createdAt).getTime();
        }),
    [data],
  );

  const total = data?.total ?? 0;
  const showingFrom = total === 0 ? 0 : pageIndex * pageSize + 1;
  const showingTo = pageIndex * pageSize + rows.length;
  const hasNext = Boolean(data?.nextCursor);
  const hasPrev = pageIndex > 0;

  function resetPaging() {
    setCursorStack([undefined]);
  }
  function clearFilters() {
    setStatus('all');
    setSeverity('all');
    setSla('all');
    setDateRange('30d');
    setSearch('');
    resetPaging();
  }
  function handleExport() {
    // CSV export is a single-page snapshot of what's currently rendered so
    // the user gets the same rows they're looking at, no surprise re-query.
    const header = ['Created', 'Order', 'Vendor', 'Customer', 'Issue', 'Severity', 'Status', 'Order total (£)'];
    const lines = [
      header.join(','),
      ...rows.map(({ d }) => {
        const customerName = `${d.order.customer.firstName ?? ''} ${d.order.customer.lastName ?? ''}`.trim() || d.order.customer.email;
        // Pass every text cell through escapeCsv — order numbers, issue types
        // and statuses are platform-controlled today but cheap to harden.
        return [
          escapeCsv(formatDate(d.createdAt)),
          escapeCsv(d.order.orderNumber),
          escapeCsv(d.order.vendor.businessName),
          escapeCsv(customerName),
          escapeCsv(d.issueType),
          escapeCsv(d.severity),
          escapeCsv(d.status),
          (d.order.totalPence / 100).toFixed(2),
        ].join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `disputes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Disputes"
        description="Customer-raised issues that require staff resolution."
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search disputes…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetPaging();
                }}
                className="w-64 pl-8"
              />
            </div>
            <Button variant="outline" onClick={handleExport} disabled={rows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </>
        }
      />

      <FilterCard
        className="mb-4"
        actions={
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FilterField label="Status">
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as DisputeStatus | 'all');
                resetPaging();
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="SLA">
            <Select
              value={sla}
              onValueChange={(v) => {
                setSla(v as SlaFilter);
                resetPaging();
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="SLA" />
              </SelectTrigger>
              <SelectContent>
                {SLA_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Date range">
            <Select
              value={dateRange}
              onValueChange={(v) => {
                setDateRange(v as DateRange);
                resetPaging();
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                {DATE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Severity
          </span>
          <div className="flex flex-wrap gap-2">
            {SEVERITY_CHIPS.map((chip) => {
              const active = severity === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => {
                    setSeverity(chip.value);
                    resetPaging();
                  }}
                  className={
                    'inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors ' +
                    (active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground')
                  }
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
      </FilterCard>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load disputes: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Order total</TableHead>
                <TableHead className="w-12" />
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
                      icon={AlertTriangle}
                      title="No disputes match these filters"
                      description="All quiet on this front. Try widening filters to see resolved cases."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map(({ d, sla: slaInfo }) => (
                <DisputeTableRow key={d.id} d={d} sla={slaInfo} />
              ))}
            </TableBody>
          </Table>
        </CardContent>

        {(rows.length > 0 || total > 0) && (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">
              Showing <strong className="font-semibold text-foreground">{showingFrom}</strong> to{' '}
              <strong className="font-semibold text-foreground">{showingTo}</strong> of{' '}
              <strong className="font-semibold text-foreground">{total}</strong> disputes
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Per page</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    resetPaging();
                  }}
                >
                  <SelectTrigger className="h-8 w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasPrev}
                  onClick={() => setCursorStack((s) => s.slice(0, -1))}
                >
                  Previous
                </Button>
                <span className="px-3 text-sm text-muted-foreground">Page {pageIndex + 1}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasNext}
                  onClick={() => setCursorStack((s) => [...s, data?.nextCursor ?? undefined])}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <DisputeStatsTiles stats={stats} />
    </>
  );
}

// -- helpers -----------------------------------------------------------------

function DisputeTableRow({ d, sla }: { d: DisputeRow; sla: SLAStatus }) {
  const customerName = `${d.order.customer.firstName ?? ''} ${d.order.customer.lastName ?? ''}`.trim();
  return (
    <TableRow>
      <TableCell className="text-sm">{formatDate(d.createdAt)}</TableCell>
      <TableCell>
        <SLAPill sla={sla} />
      </TableCell>
      <TableCell className="font-mono text-sm">{d.order.orderNumber}</TableCell>
      <TableCell>
        <NameWithAvatar name={d.order.vendor.businessName} accent="brand" />
      </TableCell>
      <TableCell>
        <NameWithAvatar name={customerName || d.order.customer.email} accent="teal" />
      </TableCell>
      <TableCell className="text-sm capitalize">{d.issueType.replace(/_/g, ' ')}</TableCell>
      <TableCell>
        <StatusPill tone={SEVERITY_TONE[d.severity]}>{d.severity}</StatusPill>
      </TableCell>
      <TableCell>
        <StatusPill tone={STATUS_TONE[d.status]}>{d.status.replace('_', ' ')}</StatusPill>
      </TableCell>
      <TableCell className="text-right text-sm">{formatPence(d.order.totalPence)}</TableCell>
      <TableCell>
        <Link
          href={`/disputes/${d.id}`}
          aria-label={`Open dispute on order ${d.order.orderNumber}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Link>
      </TableCell>
    </TableRow>
  );
}

function SLAPill({ sla }: { sla: SLAStatus }) {
  const tone = SLA_TONE_CLASSES[sla.tone];
  const weight = sla.urgent ? 'font-semibold' : 'font-medium';
  const pulse = sla.urgent ? 'animate-pulse' : '';
  return <Badge className={`${tone} ${weight} ${pulse}`.trim()}>{sla.label}</Badge>;
}

function NameWithAvatar({ name, accent }: { name: string; accent: 'brand' | 'teal' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';
  const cls = accent === 'brand' ? 'bg-brand/10 text-brand' : 'bg-teal-light text-teal-dark';
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${cls}`}
      >
        {initials}
      </span>
      <span className="truncate text-sm">{name}</span>
    </div>
  );
}

function DisputeStatsTiles({
  stats,
}: {
  stats:
    | {
        total: number;
        overdue: number;
        breachingSoon: number;
        inProgress: number;
        totalDisputedValuePence: number;
        deltaPct: number;
      }
    | undefined;
}) {
  const tiles = [
    { label: 'Total disputes', value: stats?.total ?? 0, format: 'number' as const, showDelta: true },
    { label: 'Overdue', value: stats?.overdue ?? 0, format: 'number' as const, tone: 'danger' as const },
    {
      label: 'Breaching soon',
      value: stats?.breachingSoon ?? 0,
      format: 'number' as const,
      tone: 'warning' as const,
    },
    { label: 'In progress', value: stats?.inProgress ?? 0, format: 'number' as const, tone: 'info' as const },
    {
      label: 'Total disputed value',
      value: stats?.totalDisputedValuePence ?? 0,
      format: 'money' as const,
      showDelta: true,
    },
  ];

  return (
    <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tile.label}
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {tile.format === 'money' ? formatPence(tile.value) : tile.value.toLocaleString()}
            </div>
            {tile.showDelta && stats && <DeltaBadge pct={stats.deltaPct} />}
            {!tile.showDelta && (
              <div className="mt-2 text-xs text-muted-foreground">vs last 30 days</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DeltaBadge({ pct }: { pct: number }) {
  const up = pct > 0;
  const flat = pct === 0;
  const cls = flat
    ? 'text-muted-foreground'
    : up
      ? 'text-red-700'
      : 'text-teal-dark';
  const Icon = flat ? null : up ? TrendingUp : TrendingDown;
  return (
    <div className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${cls}`}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span>
        {pct > 0 ? '+' : ''}
        {pct}% vs last 30 days
      </span>
    </div>
  );
}

function escapeCsv(s: string): string {
  // Defuse spreadsheet formula injection: any cell starting with =, +, -, @,
  // tab or CR can be interpreted as a formula by Excel/Sheets. Prefix with
  // an apostrophe (the conventional escape) before applying RFC-4180 quoting.
  let v = s;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

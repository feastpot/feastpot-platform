'use client';

import {
  Badge,
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
  AlertOctagon,
  ArrowDown,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Filter,
  Package,
  Receipt,
  RotateCcw,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterCard, FilterField } from '@/components/ui/filter-card';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { API_URL } from '@/lib/env';
import { useAccessToken } from '@/lib/auth/use-access-token';
import {
  buildOrdersCsvQuery,
  useAdminOrderStats,
  useAdminOrders,
  useTriggerRefund,
  type AdminOrderRow,
  type PaymentStatus,
  type PiStatus,
} from '@/hooks/use-admin-orders';
import {
  useOverrideOrderStatus,
  type OrderStatus,
} from '@/hooks/use-admin-users';
import { formatDateTime, formatPence } from '@/lib/format';

const STATUSES: ReadonlyArray<OrderStatus | 'all'> = [
  'all',
  'pending',
  'accepted',
  'preparing',
  'dispatched',
  'delivered',
  'cancelled',
  'refunded',
];

const PAYMENT_STATUSES: ReadonlyArray<PaymentStatus | 'all'> = [
  'all',
  'pending',
  'succeeded',
  'failed',
  'cancelled',
];

const PAGE_SIZES = [10, 25, 50, 100] as const;

interface OrdersClientProps {
  role: 'admin' | 'support' | 'finance' | 'compliance';
}

interface FilterState {
  status: OrderStatus | 'all';
  paymentStatus: PaymentStatus | 'all';
  q: string;
  createdFrom: string;
  createdTo: string;
  withPi: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyFilters(): FilterState {
  const t = todayIso();
  return {
    status: 'all',
    paymentStatus: 'all',
    q: '',
    createdFrom: t,
    createdTo: t,
    withPi: false,
  };
}

export function OrdersClient({ role }: OrdersClientProps) {
  // `draft` = whatever the user is currently editing in the filter card;
  // `applied` = the snapshot that drives the query + stats + CSV. The
  // separation mirrors the wireframe ("Apply filters" button) and keeps
  // typing in the search box from spamming the API.
  const [draft, setDraft] = useState<FilterState>(emptyFilters);
  const [applied, setApplied] = useState<FilterState>(emptyFilters);
  const [showMore, setShowMore] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const filtersForApi = {
    status: applied.status,
    paymentStatus: applied.paymentStatus,
    q: applied.q || undefined,
    createdFrom: applied.createdFrom || undefined,
    createdTo: applied.createdTo || undefined,
  };

  const { data, isLoading, error } = useAdminOrders({
    ...filtersForApi,
    withPi: applied.withPi,
    page,
    limit: pageSize,
  });
  const stats = useAdminOrderStats(filtersForApi);

  const canOverride = role === 'admin' || role === 'support';
  const canRefund = role === 'admin' || role === 'finance';

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, total);

  function applyFilters() {
    setApplied(draft);
    setPage(1);
  }

  function clearAll() {
    const fresh = emptyFilters();
    setDraft(fresh);
    setApplied(fresh);
    setPage(1);
  }

  const dateLabel = useMemo(
    () => formatDateRangeLabel(draft.createdFrom, draft.createdTo),
    [draft.createdFrom, draft.createdTo],
  );

  const csvQuery = buildOrdersCsvQuery(filtersForApi);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Search, filter, and repair orders. PI status is enriched from Stripe on demand."
        actions={<ExportCsvButton query={csvQuery} disabled={total === 0} />}
      />

      <FilterCard
        className="mb-4"
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Clear all filters
            </Button>
            <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={applyFilters}>
              Apply filters
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <FilterField label="Search">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyFilters();
              }}
            >
              <Input
                placeholder="Order ID, order number, or customer email"
                value={draft.q}
                onChange={(e) => setDraft({ ...draft, q: e.target.value })}
              />
            </form>
          </FilterField>

          <FilterField label="Status">
            <Select
              value={draft.status}
              onValueChange={(v) => setDraft({ ...draft, status: v as OrderStatus | 'all' })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === 'all' ? 'All statuses' : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Date range">
            <DateRangePopover
              from={draft.createdFrom}
              to={draft.createdTo}
              label={dateLabel}
              onChange={(from, to) => setDraft({ ...draft, createdFrom: from, createdTo: to })}
            />
          </FilterField>

          <FilterField label="Payment status">
            <Select
              value={draft.paymentStatus}
              onValueChange={(v) =>
                setDraft({ ...draft, paymentStatus: v as PaymentStatus | 'all' })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === 'all' ? 'All payment statuses' : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="\u00a0">
            <Button
              type="button"
              variant="outline"
              className="justify-between"
              onClick={() => setShowMore((v) => !v)}
            >
              <span className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                More filters
              </span>
            </Button>
          </FilterField>
        </div>

        {showMore && (
          <div className="mt-3 border-t border-border pt-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={draft.withPi}
                onChange={(e) => setDraft({ ...draft, withPi: e.target.checked })}
              />
              Enrich first 50 rows with Stripe PaymentIntent status
            </label>
          </div>
        )}
      </FilterCard>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiTile
          icon={Package}
          label="Total orders"
          value={stats.data ? String(stats.data.total) : '—'}
          tone="brand"
        />
        <KpiTile
          icon={Clock}
          label="Today"
          value={stats.data ? String(stats.data.today) : '—'}
          tone="info"
        />
        <KpiTile
          icon={CheckCircle2}
          label="Completed"
          value={stats.data ? String(stats.data.completed) : '—'}
          tone="success"
        />
        <KpiTile
          icon={AlertOctagon}
          label="Exceptions"
          value={stats.data ? String(stats.data.exceptions) : '—'}
          tone="danger"
        />
        <KpiTile
          icon={TrendingUp}
          label="Success rate"
          value={
            stats.data
              ? stats.data.successRatePct === null
                ? '—'
                : `${stats.data.successRatePct}%`
              : '—'
          }
          tone="neutral"
        />
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load orders: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input type="checkbox" disabled aria-label="Select all (coming soon)" />
                </TableHead>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>PI Status</TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    Created <ArrowDown className="h-3 w-3" aria-label="sorted descending" />
                  </span>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="p-0">
                    <EmptyState
                      icon={Receipt}
                      title="No orders match your filters"
                      description="Try adjusting your search criteria or filters."
                      action={
                        <Button variant="outline" size="sm" onClick={clearAll}>
                          <RotateCcw className="mr-1 h-3.5 w-3.5" />
                          Clear all filters
                        </Button>
                      }
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((o) => (
                <OrdersTableRow
                  key={o.id}
                  order={o}
                  canOverride={canOverride}
                  canRefund={canRefund}
                />
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
            <span>
              Showing <strong className="font-semibold text-foreground">{showingFrom}</strong>
              {showingTo > showingFrom ? (
                <>
                  -<strong className="font-semibold text-foreground"> {showingTo}</strong>
                </>
              ) : null}{' '}
              of <strong className="font-semibold text-foreground">{total}</strong> orders
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs">Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function ExportCsvButton({ query, disabled }: { query: string; disabled: boolean }) {
  const token = useAccessToken();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/v1/admin/orders.csv?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `feastpot-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={disabled || busy || !token}>
      <Download className="mr-1.5 h-4 w-4" />
      {busy ? 'Exporting…' : 'Export CSV'}
    </Button>
  );
}

function DateRangePopover({
  from,
  to,
  label,
  onChange,
}: {
  from: string;
  to: string;
  label: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
      >
        <span className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <span className="flex flex-col items-start leading-tight">
            <span className="font-medium">{labelTopLine(from, to)}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </span>
        </span>
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 w-72 rounded-md border border-border bg-popover p-3 shadow-md"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col text-xs text-muted-foreground">
              From
              <input
                type="date"
                className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={from}
                onChange={(e) => onChange(e.target.value, to)}
              />
            </label>
            <label className="flex flex-col text-xs text-muted-foreground">
              To
              <input
                type="date"
                className="mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={to}
                onChange={(e) => onChange(from, e.target.value)}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {(
              [
                ['Today', 0],
                ['Last 7d', 7],
                ['Last 30d', 30],
              ] as Array<[string, number]>
            ).map(([lbl, days]) => (
              <Button
                key={lbl}
                size="sm"
                variant="ghost"
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setUTCDate(start.getUTCDate() - days);
                  onChange(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
                }}
              >
                {lbl}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange('', '')}
              className="ml-auto"
            >
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function labelTopLine(from: string, to: string): string {
  if (!from && !to) return 'All dates';
  if (from && to && from === to) {
    const t = new Date().toISOString().slice(0, 10);
    if (from === t) return 'Today';
  }
  return 'Custom';
}

function formatDateRangeLabel(from: string, to: string): string {
  if (!from && !to) return 'Any time';
  const fmt = (iso: string): string => {
    if (!iso) return '…';
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  if (from && to) return `${fmt(from)} - ${fmt(to)}`;
  return fmt(from || to);
}

function KpiTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  tone: 'brand' | 'info' | 'success' | 'danger' | 'neutral';
}) {
  const toneClass: Record<typeof tone, string> = {
    brand: 'bg-brand/10 text-brand',
    info: 'bg-blue-500/10 text-blue-600',
    success: 'bg-emerald-500/10 text-emerald-600',
    danger: 'bg-rose-500/10 text-rose-600',
    neutral: 'bg-muted text-foreground',
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${toneClass[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold leading-tight">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function OrdersTableRow({
  order,
  canOverride,
  canRefund,
}: {
  order: AdminOrderRow;
  canOverride: boolean;
  canRefund: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [reason, setReason] = useState('');
  const override = useOverrideOrderStatus({
    onSuccess: () => {
      setEditing(false);
      setReason('');
    },
  });

  const items = order.items.map((i) => `${i.quantity}× ${i.nameSnapshot}`).join(', ');
  const customerName =
    `${order.customer.firstName ?? ''} ${order.customer.lastName ?? ''}`.trim() ||
    order.customer.email;

  return (
    <>
      <TableRow>
        <TableCell>
          <input type="checkbox" disabled aria-label="Select row (coming soon)" />
        </TableCell>
        <TableCell className="font-mono text-xs">{order.orderNumber}</TableCell>
        <TableCell>
          <Link
            href={`/users?email=${encodeURIComponent(order.customer.email)}`}
            className="text-xs underline-offset-2 hover:underline"
          >
            {customerName}
          </Link>
          <div className="text-xs text-muted-foreground">{order.customer.email}</div>
        </TableCell>
        <TableCell className="text-xs">{order.vendor.businessName}</TableCell>
        <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={items}>
          {items || '-'}
        </TableCell>
        <TableCell className="text-right">{formatPence(order.totalPence)}</TableCell>
        <TableCell>
          <StatusPill tone={orderStatusTone(order.status)}>{order.status}</StatusPill>
        </TableCell>
        <TableCell>
          <PaymentBadge status={order.paymentStatus} />
        </TableCell>
        <TableCell>
          <PiBadge status={order.piStatus} />
        </TableCell>
        <TableCell className="text-xs">{formatDateTime(order.createdAt)}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            {canOverride && (
              <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
                Override
              </Button>
            )}
            {canRefund && order.stripePaymentIntentId && (
              <Button size="sm" variant="ghost" onClick={() => setRefundOpen(true)}>
                Refund
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {editing && canOverride && (
        <TableRow>
          <TableCell colSpan={11} className="bg-muted/30">
            <div className="flex flex-wrap items-center gap-2 py-2">
              <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.filter((s) => s !== 'all').map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Reason for override (audited)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="max-w-md"
              />
              <Button
                size="sm"
                disabled={!reason.trim() || status === order.status || override.isPending}
                onClick={() =>
                  override.mutate({ orderId: order.id, status, reason: reason.trim() })
                }
              >
                {override.isPending ? 'Saving…' : 'Apply'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              {override.error && (
                <span className="text-xs text-destructive">
                  {(override.error as Error).message}
                </span>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
      {canRefund && (
        <RefundDialog order={order} open={refundOpen} onOpenChange={setRefundOpen} />
      )}
    </>
  );
}

function orderStatusTone(status: OrderStatus): StatusTone {
  switch (status) {
    case 'delivered':
      return 'success';
    case 'dispatched':
    case 'preparing':
    case 'accepted':
      return 'info';
    case 'pending':
      return 'warning';
    case 'cancelled':
    case 'refunded':
      return 'danger';
    default:
      return 'neutral';
  }
}

function PaymentBadge({ status }: { status: PaymentStatus | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">-</span>;
  const tone: StatusTone =
    status === 'succeeded'
      ? 'success'
      : status === 'pending'
        ? 'warning'
        : 'danger';
  return <StatusPill tone={tone}>{status}</StatusPill>;
}

function PiBadge({ status }: { status: PiStatus }) {
  if (!status) return <span className="text-xs text-muted-foreground">-</span>;
  const variant: 'secondary' | 'destructive' | 'outline' =
    status === 'succeeded' || status === 'requires_capture'
      ? 'secondary'
      : status === 'canceled' || status === 'requires_payment_method'
        ? 'destructive'
        : 'outline';
  return <Badge variant={variant}>{status}</Badge>;
}

function RefundDialog({
  order,
  open,
  onOpenChange,
}: {
  order: AdminOrderRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [pounds, setPounds] = useState((order.totalPence / 100).toFixed(2));
  const [reason, setReason] = useState('');
  const refund = useTriggerRefund();
  const amountPence = Math.round(Number(pounds) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trigger refund</DialogTitle>
          <DialogDescription>
            Order {order.orderNumber} - total {formatPence(order.totalPence)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Amount (£)</span>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              max={(order.totalPence / 100).toFixed(2)}
              value={pounds}
              onChange={(e) => setPounds(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Reason (audited)</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {refund.error && (
            <p className="text-xs text-destructive">{(refund.error as Error).message}</p>
          )}
          {refund.isSuccess && (
            <p className="text-xs text-emerald-600">Refund queued successfully.</p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            disabled={amountPence < 1 || amountPence > order.totalPence || refund.isPending}
            onClick={() =>
              refund.mutate({ orderId: order.id, amountPence, reason: reason.trim() || undefined })
            }
          >
            {refund.isPending ? 'Processing…' : `Refund ${formatPence(amountPence)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

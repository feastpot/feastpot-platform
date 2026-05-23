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
import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterCard, FilterField } from '@/components/ui/filter-card';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import {
  useAdminOrders,
  useTriggerRefund,
  type AdminOrderRow,
  type DateRange,
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

const RANGES: ReadonlyArray<DateRange | 'all'> = ['all', 'today', 'week', 'month'];

interface OrdersClientProps {
  role: 'admin' | 'support' | 'finance' | 'compliance';
}

export function OrdersClient({ role }: OrdersClientProps) {
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [range, setRange] = useState<DateRange | 'all'>('today');
  const [search, setSearch] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [withPi, setWithPi] = useState(false);

  const { data, isLoading, error } = useAdminOrders({
    status,
    range,
    q: submittedQ || undefined,
    withPi,
  });

  const canOverride = role === 'admin' || role === 'support';
  const canRefund = role === 'admin' || role === 'finance';

  return (
    <>
      <PageHeader
        title="Orders"
        description="Search, filter, and repair orders. PI status is enriched from Stripe on demand."
      />

      <FilterCard
        className="mb-4"
        actions={
          <Button
            type="button"
            onClick={() => setSubmittedQ(search.trim())}
          >
            Apply
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <FilterField label="Search">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmittedQ(search.trim());
                }}
              >
                <Input
                  placeholder="Order ID, order number, or customer email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </form>
            </FilterField>
          </div>
          <FilterField label="Status">
            <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus | 'all')}>
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
          </FilterField>
          <FilterField label="Date range">
            <Select value={range} onValueChange={(v) => setRange(v as DateRange | 'all')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground md:col-span-4">
            <input
              type="checkbox"
              checked={withPi}
              onChange={(e) => setWithPi(e.target.checked)}
            />
            Enrich first 50 rows with Stripe PaymentIntent status
          </label>
        </div>
      </FilterCard>

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
                <TableHead>Created</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>PI</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={Receipt}
                      title="No orders match these filters"
                      description="Try widening the date range or clearing the search box."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {(data ?? []).map((o) => (
                <OrdersTableRow
                  key={o.id}
                  order={o}
                  canOverride={canOverride}
                  canRefund={canRefund}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
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
        <TableCell className="text-xs">{formatDateTime(order.createdAt)}</TableCell>
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
          <PiBadge status={order.piStatus} />
        </TableCell>
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
          <TableCell colSpan={8} className="bg-muted/30">
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

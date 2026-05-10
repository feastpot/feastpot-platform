'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@feastpot/ui';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';

import { useCountdown, formatMmSs } from '@/hooks/use-countdown';
import { useUpdateOrderStatus } from '@/hooks/use-update-order-status';
import type { VendorOrder, VendorOrderStatus } from '@/hooks/use-vendor-orders';

import { RejectDialog } from './reject-dialog';

const STATUS_STYLES: Record<VendorOrderStatus, string> = {
  pending: 'bg-amber-100 text-amber-900 border-amber-200',
  accepted: 'bg-blue-100 text-blue-900 border-blue-200',
  preparing: 'bg-indigo-100 text-indigo-900 border-indigo-200',
  dispatched: 'bg-purple-100 text-purple-900 border-purple-200',
  delivered: 'bg-teal-light text-teal-dark border-teal/30',
  cancelled: 'bg-red-100 text-red-900 border-red-200',
  refunded: 'bg-rose-100 text-rose-900 border-rose-200',
  rejected: 'bg-red-100 text-red-900 border-red-200',
};

const PENDING_TIMEOUT_MIN = 15;

function poundsFromPence(pence: number): string {
  return (pence / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}

function customerFirstName(order: VendorOrder): string {
  const first = order.customer?.firstName;
  if (first) return first;
  // Fallback: take the first word of `name` if the API returned it instead.
  const full = order.customer?.name?.trim();
  return full ? full.split(/\s+/)[0]! : 'Customer';
}

function formatItemName(item: VendorOrder['items'][number]): string {
  // Name is stashed under different keys depending on the API shape; pick the
  // first present one so we don't have to chase the schema.
  const candidates = ['itemName', 'name', 'productName', 'title'];
  for (const k of candidates) {
    const v = (item as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return 'Item';
}

function deliverySlot(order: VendorOrder): string | null {
  if (!order.scheduledFor) return null;
  const start = new Date(order.scheduledFor);
  // Most slots are 1h windows — show start–end in vendor local time.
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return `${format(start, 'EEEE HH:mm')}–${format(end, 'HH:mm')}`;
}

interface Props {
  order: VendorOrder;
}

export function OrderCard({ order }: Props) {
  const updateStatus = useUpdateOrderStatus();
  const [rejectOpen, setRejectOpen] = useState(false);
  // Capture deadline once per render so it stays stable for the countdown.
  const deadline = useMemo(() => {
    if (order.status !== 'pending') return null;
    return new Date(new Date(order.createdAt).getTime() + PENDING_TIMEOUT_MIN * 60 * 1000);
  }, [order.status, order.createdAt]);

  const remaining = useCountdown(deadline, () => {
    // Auto-reject on timeout. The mutation key + invalidation will pull the
    // card out of the active list on success.
    if (order.status !== 'pending') return;
    updateStatus.mutate({
      orderId: order.id,
      status: 'rejected',
      rejectionReason: 'auto_rejected_timeout',
    });
  });

  const pendingExpired = order.status === 'pending' && remaining === 0;

  function advance(next: VendorOrderStatus) {
    updateStatus.mutate({ orderId: order.id, status: next });
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="space-y-1 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                {customerFirstName(order)}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  · {order.orderNumber}
                </span>
              </CardTitle>
              {deliverySlot(order) && (
                <p className="text-sm text-muted-foreground">{deliverySlot(order)}</p>
              )}
            </div>
            <Badge variant="outline" className={STATUS_STYLES[order.status]}>
              {order.status}
            </Badge>
          </div>
          {order.status === 'pending' && deadline && !pendingExpired && (
            <p className="text-xs font-mono text-amber-700">
              Auto-reject in {formatMmSs(remaining)}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3 pb-3">
          <ul className="space-y-1 text-sm">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{item.quantity}×</span>
                <span className="flex-1">{formatItemName(item)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-border pt-3 text-sm">
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span>{poundsFromPence(order.totalPence)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>You receive</span>
              <span>{poundsFromPence(order.vendorPayoutPence)}</span>
            </div>
          </div>
          {order.notes && (
            <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
              <strong className="font-medium">Note: </strong>
              {order.notes}
            </div>
          )}
        </CardContent>
        <CardFooter className="gap-2 border-t bg-muted/30 py-3">
          {order.status === 'pending' && (
            <>
              <Button
                size="sm"
                className="flex-1 bg-teal hover:bg-teal-dark text-white"
                disabled={updateStatus.isPending}
                onClick={() => advance('accepted')}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1"
                disabled={updateStatus.isPending}
                onClick={() => setRejectOpen(true)}
              >
                Reject
              </Button>
            </>
          )}
          {order.status === 'accepted' && (
            <Button
              size="sm"
              className="w-full"
              disabled={updateStatus.isPending}
              onClick={() => advance('preparing')}
            >
              Mark as preparing
            </Button>
          )}
          {order.status === 'preparing' && (
            <Button
              size="sm"
              className="w-full"
              disabled={updateStatus.isPending}
              onClick={() => advance('dispatched')}
            >
              Mark as dispatched
            </Button>
          )}
          {order.status === 'dispatched' && (
            <Button
              size="sm"
              className="w-full bg-teal hover:bg-teal-dark text-white"
              disabled={updateStatus.isPending}
              onClick={() => advance('delivered')}
            >
              Mark as delivered
            </Button>
          )}
        </CardFooter>
      </Card>
      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        orderNumber={order.orderNumber}
        busy={updateStatus.isPending}
        onConfirm={(reason) => {
          updateStatus.mutate(
            { orderId: order.id, status: 'rejected', rejectionReason: reason },
            { onSettled: () => setRejectOpen(false) },
          );
        }}
      />
    </>
  );
}

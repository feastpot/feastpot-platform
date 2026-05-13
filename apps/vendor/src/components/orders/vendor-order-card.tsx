'use client';

import { cn } from '@feastpot/ui';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';

import { useProposeAmendment } from '@/hooks/use-propose-amendment';
import { useUpdateOrderStatus } from '@/hooks/use-update-order-status';
import type { VendorOrder, VendorOrderStatus } from '@/hooks/use-vendor-orders';

import { Countdown } from './countdown';
import { DispatchEtaSheet } from './dispatch-eta-sheet';
import { ProposeAmendmentSheet } from './propose-amendment-sheet';
import { RejectSheet } from './reject-sheet';

const PENDING_TIMEOUT_MIN = 15;

function poundsFromPence(pence: number): string {
  return (pence / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}

function customerFirstName(order: VendorOrder): string {
  const first = order.customer?.firstName;
  if (first) return first;
  const full = order.customer?.name?.trim();
  return full ? full.split(/\s+/)[0]! : 'Customer';
}

function formatItemName(item: VendorOrder['items'][number]): string {
  // The API returns one of these keys depending on shape — try them in
  // order before giving up so we don't need to chase every server change.
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
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return `${format(start, 'EEE d MMM, HH:mm')}–${format(end, 'HH:mm')}`;
}

interface Props {
  order: VendorOrder;
}

/**
 * Redesigned active-order card used in the kanban tabs.
 *
 * Sections (top-to-bottom):
 *   1. Header — first name + slot prominence on top, order ref smaller
 *   2. Item list — quantities up front, dish name to the right
 *   3. Total + payout strip — gross total on top, "you receive" net below
 *   4. Notes (amber background) — only when present
 *   5. Countdown — only on pending orders, fires onExpire to auto-reject
 *   6. Action buttons — context-specific per status
 *
 * Logic preserved from the legacy OrderCard: 15-minute pending auto-reject,
 * optimistic updateOrderStatus mutation, structured-reason RejectSheet for
 * pending → rejected transitions.
 */
export function VendorOrderCard({ order }: Props) {
  const updateStatus = useUpdateOrderStatus();
  const proposeAmendment = useProposeAmendment();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [etaOpen, setEtaOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);

  // Vendor can propose a change once the order is accepted and until it's
  // delivered — same window the API enforces. Keep the button hidden outside
  // that range so the affordance only shows when it'll work.
  const canPropose: VendorOrderStatus[] = ['accepted', 'preparing', 'dispatched'];
  const showProposeButton = canPropose.includes(order.status);

  const deadline = useMemo(() => {
    if (order.status !== 'pending') return null;
    return new Date(new Date(order.createdAt).getTime() + PENDING_TIMEOUT_MIN * 60 * 1000);
  }, [order.status, order.createdAt]);

  function advance(next: VendorOrderStatus) {
    updateStatus.mutate({ orderId: order.id, status: next });
  }

  const slot = deliverySlot(order);

  return (
    <>
      <article className="fp-card overflow-hidden border border-border">
        {/* HEADER */}
        <header className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-dark">
              {customerFirstName(order)}
            </p>
            {slot && (
              <p className="text-xs font-semibold text-vendor">{slot}</p>
            )}
            <p className="mt-0.5 text-[11px] text-mid">#{order.orderNumber}</p>
          </div>
          {order.status === 'pending' && deadline && (
            <Countdown
              expiresAt={deadline}
              onExpire={() => {
                if (order.status !== 'pending') return;
                updateStatus.mutate({
                  orderId: order.id,
                  status: 'rejected',
                  rejectionReason: 'auto_rejected_timeout',
                });
              }}
            />
          )}
        </header>

        {/* ITEMS */}
        <ul className="mt-3 space-y-1 px-4 text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-2">
              <span className="w-6 shrink-0 font-semibold tabular-nums text-dark">
                {item.quantity}×
              </span>
              <span className="flex-1 text-mid">{formatItemName(item)}</span>
            </li>
          ))}
        </ul>

        {/* TOTAL + PAYOUT */}
        <div className="mt-3 border-t border-border px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-mid">Total</span>
            <span className="text-base font-bold text-dark">
              {poundsFromPence(order.totalPence)}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between text-xs">
            <span className="text-mid">You receive</span>
            <span className="font-semibold text-brand">
              {poundsFromPence(order.vendorPayoutPence)}
            </span>
          </div>
        </div>

        {/* NOTES */}
        {order.notes && (
          <div className="mx-4 mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong className="font-semibold">Note: </strong>
            {order.notes}
          </div>
        )}

        {/* ACTIONS */}
        <footer className="flex gap-2 border-t border-border bg-surface px-4 py-3">
          {order.status === 'pending' && (
            <>
              <button
                type="button"
                onClick={() => setRejectOpen(true)}
                disabled={updateStatus.isPending}
                className="touch-target flex-1 rounded-2xl border border-red-300 bg-white text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => advance('accepted')}
                disabled={updateStatus.isPending}
                className={cn(
                  'touch-target rounded-2xl bg-teal text-sm font-bold text-white hover:bg-teal-dark disabled:opacity-50',
                  // Wider so accept is the obvious primary action.
                  'flex-[1.6]',
                )}
              >
                {updateStatus.isPending ? 'Accepting…' : 'Accept ✓'}
              </button>
            </>
          )}
          {order.status === 'accepted' && (
            <button
              type="button"
              onClick={() => advance('preparing')}
              disabled={updateStatus.isPending}
              className="touch-target w-full rounded-2xl bg-vendor text-sm font-bold text-white hover:bg-vendor-dark disabled:opacity-50"
            >
              Mark preparing →
            </button>
          )}
          {order.status === 'preparing' && (
            <button
              type="button"
              onClick={() => setEtaOpen(true)}
              disabled={updateStatus.isPending}
              className="touch-target w-full rounded-2xl bg-vendor text-sm font-bold text-white hover:bg-vendor-dark disabled:opacity-50"
            >
              Mark dispatched →
            </button>
          )}
          {order.status === 'dispatched' && (
            <button
              type="button"
              onClick={() => advance('delivered')}
              disabled={updateStatus.isPending}
              className="touch-target w-full rounded-2xl bg-teal text-sm font-bold text-white hover:bg-teal-dark disabled:opacity-50"
            >
              Mark delivered ✓
            </button>
          )}
        </footer>

        {/* Secondary action — propose a change (FR-AMD-001). Lives outside the
            primary footer so the main CTA stays the obvious next step. */}
        {showProposeButton && (
          <div className="border-t border-border bg-white px-4 py-2 text-right">
            <button
              type="button"
              onClick={() => setAmendOpen(true)}
              className="text-xs font-semibold text-vendor underline-offset-2 hover:underline"
            >
              Propose a change
            </button>
          </div>
        )}
      </article>

      <RejectSheet
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

      <DispatchEtaSheet
        open={etaOpen}
        onOpenChange={setEtaOpen}
        orderNumber={order.orderNumber}
        busy={updateStatus.isPending}
        onConfirm={(etaMinutes) => {
          updateStatus.mutate(
            { orderId: order.id, status: 'dispatched', etaMinutes: etaMinutes ?? undefined },
            { onSettled: () => setEtaOpen(false) },
          );
        }}
      />

      <ProposeAmendmentSheet
        open={amendOpen}
        onOpenChange={setAmendOpen}
        orderNumber={order.orderNumber}
        busy={proposeAmendment.isPending}
        onConfirm={(proposedChange, priceDeltaPence) => {
          proposeAmendment.mutate(
            { orderId: order.id, proposedChange, priceDeltaPence },
            { onSettled: () => setAmendOpen(false) },
          );
        }}
      />
    </>
  );
}

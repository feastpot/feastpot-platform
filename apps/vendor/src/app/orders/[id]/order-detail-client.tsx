'use client';

import { cn } from '@feastpot/ui';
import { format } from 'date-fns';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { DispatchEtaSheet } from '@/components/orders/dispatch-eta-sheet';
import { NeedsClarificationSheet } from '@/components/orders/needs-clarification-sheet';
import { ProposeAmendmentSheet } from '@/components/orders/propose-amendment-sheet';
import { RejectSheet } from '@/components/orders/reject-sheet';
import { useProposeAmendment } from '@/hooks/use-propose-amendment';
import { useUpdateOrderStatus } from '@/hooks/use-update-order-status';
import { useVendorOrder, type VendorOrderDetail } from '@/hooks/use-vendor-order';
import type { VendorOrderStatus } from '@/hooks/use-vendor-orders';

function poundsFromPence(pence: number): string {
  return (pence / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}

function customerName(order: VendorOrderDetail): string {
  const c = order.customer;
  if (!c) return 'Customer';
  const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return full || c.email || 'Customer';
}

function deliverySlot(order: VendorOrderDetail): string | null {
  if (!order.scheduledFor) return null;
  const start = new Date(order.scheduledFor);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return `${format(start, 'EEE d MMM yyyy, HH:mm')} to ${format(end, 'HH:mm')}`;
}

interface BadgeProps {
  status: VendorOrderStatus;
}

const STATUS_LABELS: Record<VendorOrderStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  needs_clarification: 'Needs clarification',
  preparing: 'Preparing',
  ready: 'Ready',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  refunded: 'Refunded',
};

function StatusBadge({ status }: BadgeProps) {
  const tone: Record<VendorOrderStatus, string> = {
    pending: 'bg-amber-100 text-amber-900',
    accepted: 'bg-vendor/10 text-vendor',
    needs_clarification: 'bg-amber-100 text-amber-900',
    preparing: 'bg-vendor/10 text-vendor',
    ready: 'bg-teal/10 text-teal-dark',
    dispatched: 'bg-vendor/10 text-vendor',
    delivered: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-mid/10 text-mid',
    rejected: 'bg-red-100 text-red-700',
    refunded: 'bg-mid/10 text-mid',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
        tone[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

interface TimelineEvent {
  label: string;
  at: string | null | undefined;
}

function Timeline({ order }: { order: VendorOrderDetail }) {
  const events: TimelineEvent[] = [
    { label: 'Placed', at: order.createdAt },
    { label: 'Accepted', at: order.acceptedAt },
    { label: 'Dispatched', at: order.dispatchedAt },
    { label: 'Delivered', at: order.deliveredAt },
    { label: 'Cancelled', at: order.cancelledAt },
  ].filter((e): e is TimelineEvent => Boolean(e.at));

  if (events.length === 0) return null;
  return (
    <ol className="space-y-2">
      {events.map((e) => (
        <li key={e.label} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium text-dark">{e.label}</span>
          <span className="tabular-nums text-mid">
            {format(new Date(e.at!), 'd MMM, HH:mm')}
          </span>
        </li>
      ))}
    </ol>
  );
}

function allAllergens(order: VendorOrderDetail): string[] {
  const set = new Set<string>();
  for (const it of order.items) {
    const list = it.menuItem?.allergens ?? [];
    for (const a of list) if (a) set.add(a);
  }
  return Array.from(set).sort();
}

export function OrderDetailClient({ orderId }: { orderId: string }) {
  const { data: order, isLoading, error } = useVendorOrder(orderId);
  const updateStatus = useUpdateOrderStatus();
  const proposeAmendment = useProposeAmendment();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [etaOpen, setEtaOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  const allergens = useMemo(() => (order ? allAllergens(order) : []), [order]);

  // T009: when arrived from a kanban "Print" link we auto-open the
  // browser print dialog once the page has painted. Behind a query flag so
  // direct navigation doesn't surprise the user with a print prompt.
  // Declared before early returns to satisfy rules-of-hooks.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('print') !== '1') return;
    const t = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(t);
  }, []);

  if (isLoading) {
    return <div className="fp-card p-6 text-sm text-mid">Loading order…</div>;
  }
  if (error || !order) {
    return (
      <div className="fp-card p-6">
        <p className="text-sm font-semibold text-red-600">Could not load this order.</p>
        <p className="mt-1 text-xs text-mid">
          It may not exist, or you may not have access to it.
        </p>
        <Link
          href="/orders"
          className="mt-3 inline-block text-sm font-semibold text-vendor underline-offset-2 hover:underline"
        >
          Back to orders
        </Link>
      </div>
    );
  }

  function advance(next: VendorOrderStatus) {
    updateStatus.mutate({ orderId: order!.id, status: next });
  }

  const slot = deliverySlot(order);
  const isAmendable: VendorOrderStatus[] = ['accepted', 'preparing', 'ready', 'dispatched'];
  const hasOpenDispute = (order.disputes?.length ?? 0) > 0;
  const pendingAmendment = order.amendments?.[0];

  return (
    <div className="space-y-4 print:space-y-3">
      {/* Top bar with back + print, hidden on print */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/orders"
          className="text-sm font-semibold text-vendor underline-offset-2 hover:underline"
        >
          ← Back to orders
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="touch-target rounded-2xl border border-border bg-white px-4 text-sm font-semibold text-dark hover:bg-surface"
          >
            Print
          </button>
          {/* T009: download as PDF. The browser print dialog has a built-in
              "Save as PDF" destination on every major browser, so we route
              that through window.print() rather than ship a PDF renderer. */}
          <button
            type="button"
            onClick={() => window.print()}
            className="touch-target rounded-2xl border border-border bg-white px-4 text-sm font-semibold text-dark hover:bg-surface"
          >
            Download PDF
          </button>
          <a
            href="mailto:support@feastpot.co.uk?subject=Order%20support"
            className="touch-target rounded-2xl border border-border bg-white px-4 text-sm font-semibold text-dark hover:bg-surface"
          >
            Contact support
          </a>
        </div>
      </div>

      {/* HEADER */}
      <header className="fp-card space-y-2 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-mid">Order</p>
            <h1 className="text-2xl font-bold text-dark">#{order.orderNumber}</h1>
            {slot && (
              <p className="mt-1 text-sm font-semibold text-vendor">{slot}</p>
            )}
            <p className="text-xs text-mid">
              Placed {format(new Date(order.createdAt), 'EEE d MMM, HH:mm')}
            </p>
          </div>
          <StatusBadge status={order.status} />
        </div>
        {order.type !== 'standard' && (
          <p className="text-xs font-semibold uppercase tracking-wide text-vendor">
            {order.type === 'event' ? 'Event order' : 'Subscription order'}
          </p>
        )}
      </header>

      {/* DISPUTE BANNER */}
      {hasOpenDispute && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 print:border print:border-red-500">
          <p className="font-bold">Open dispute on this order</p>
          {order.disputes?.map((d) => (
            <p key={d.id} className="mt-1 text-xs">
              {d.issueType.replace(/_/g, ' ')} ({d.severity}): {d.description}
            </p>
          ))}
        </div>
      )}

      {/* PENDING AMENDMENT BANNER */}
      {pendingAmendment && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Pending change awaiting customer reply</p>
          <p className="mt-1 text-xs">{pendingAmendment.proposedChange}</p>
          {pendingAmendment.priceDeltaPence !== null &&
            pendingAmendment.priceDeltaPence !== undefined &&
            pendingAmendment.priceDeltaPence !== 0 && (
              <p className="mt-1 text-xs font-semibold">
                Price change: {poundsFromPence(pendingAmendment.priceDeltaPence)}
              </p>
            )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* MAIN COLUMN */}
        <div className="space-y-4 lg:col-span-2">
          {/* ITEMS */}
          <section className="fp-card p-5">
            <h2 className="text-base font-bold text-dark">Items</h2>
            <ul className="mt-3 divide-y divide-border">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 py-3 text-sm">
                  <span className="w-8 shrink-0 text-base font-bold tabular-nums text-dark">
                    {item.quantity}×
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-dark">{item.nameSnapshot}</p>
                    {item.menuItem?.category && (
                      <p className="text-[11px] uppercase tracking-wide text-mid">
                        {item.menuItem.category}
                      </p>
                    )}
                    {item.notes && (
                      <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
                        Note: {item.notes}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-dark">
                    {poundsFromPence(item.totalPence)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* ALLERGY SUMMARY */}
          {allergens.length > 0 && (
            <section className="fp-card border-2 border-amber-300 p-5">
              <h2 className="text-base font-bold text-amber-900">Allergen summary</h2>
              <p className="mt-1 text-xs text-amber-900">
                Combined from all items in this order. Always cross-check the customer
                note below.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {allergens.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* DELIVERY INSTRUCTIONS / NOTES */}
          {order.notes && (
            <section className="fp-card p-5">
              <h2 className="text-base font-bold text-dark">Customer notes</h2>
              <p className="mt-2 whitespace-pre-line rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {order.notes}
              </p>
            </section>
          )}

          {/* TOTALS */}
          <section className="fp-card p-5">
            <h2 className="text-base font-bold text-dark">Totals</h2>
            <dl className="mt-3 space-y-1 text-sm">
              <Row label="Subtotal" value={poundsFromPence(order.subtotalPence)} />
              {order.deliveryFeePence > 0 && (
                <Row label="Delivery" value={poundsFromPence(order.deliveryFeePence)} />
              )}
              {order.serviceFeePence > 0 && (
                <Row label="Service fee" value={poundsFromPence(order.serviceFeePence)} />
              )}
              {order.discountPence > 0 && (
                <Row
                  label="Discount"
                  value={`- ${poundsFromPence(order.discountPence)}`}
                />
              )}
              <div className="mt-2 border-t border-border pt-2">
                <Row
                  label="Customer paid"
                  value={poundsFromPence(order.totalPence)}
                  bold
                />
              </div>
              <Row
                label="Platform commission"
                value={`- ${poundsFromPence(order.commissionPence)}`}
                muted
              />
              <div className="mt-2 border-t border-border pt-2">
                <Row
                  label="You receive"
                  value={poundsFromPence(order.vendorPayoutPence)}
                  bold
                  accent
                />
              </div>
            </dl>
          </section>
        </div>

        {/* SIDE COLUMN */}
        <div className="space-y-4">
          {/* CUSTOMER */}
          <section className="fp-card p-5">
            <h2 className="text-base font-bold text-dark">Customer</h2>
            <p className="mt-2 text-sm font-semibold text-dark">{customerName(order)}</p>
            {order.customer?.phone && (
              <p className="mt-1 text-sm">
                <a
                  href={`tel:${order.customer.phone}`}
                  className="text-vendor underline-offset-2 hover:underline"
                >
                  {order.customer.phone}
                </a>
              </p>
            )}
            {order.customer?.email && (
              <p className="mt-1 text-sm">
                <a
                  href={`mailto:${order.customer.email}`}
                  className="text-vendor underline-offset-2 hover:underline"
                >
                  {order.customer.email}
                </a>
              </p>
            )}
          </section>

          {/* DELIVERY */}
          <section className="fp-card p-5">
            <h2 className="text-base font-bold text-dark">Delivery</h2>
            <p className="mt-2 text-xs uppercase tracking-wide text-mid">
              {order.deliveryType.replace(/_/g, ' ')}
            </p>
            {slot && <p className="mt-1 text-sm font-semibold text-vendor">{slot}</p>}
            {order.address ? (
              <address className="mt-2 not-italic text-sm text-dark">
                {order.address.line1}
                {order.address.line2 ? `, ${order.address.line2}` : ''}
                <br />
                {order.address.city} {order.address.postcode}
              </address>
            ) : (
              <p className="mt-2 text-sm text-mid">No delivery address (collection).</p>
            )}
            {order.etaAt && (
              <p className="mt-3 text-xs text-mid">
                ETA stamped: {format(new Date(order.etaAt), 'HH:mm')}
              </p>
            )}
          </section>

          {/* TIMELINE */}
          <section className="fp-card p-5">
            <h2 className="text-base font-bold text-dark">Timeline</h2>
            <div className="mt-3">
              <Timeline order={order} />
            </div>
            {order.cancellationReason && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">
                Reason: {order.cancellationReason}
              </p>
            )}
          </section>
        </div>
      </div>

      {/* ACTIONS */}
      <section className="fp-card p-5 print:hidden">
        <h2 className="text-base font-bold text-dark">Actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {order.status === 'pending' && (
            <>
              <button
                type="button"
                onClick={() => advance('accepted')}
                disabled={updateStatus.isPending}
                className="touch-target rounded-2xl bg-teal px-5 text-sm font-bold text-white hover:bg-teal-dark disabled:opacity-50"
              >
                Accept order
              </button>
              <button
                type="button"
                onClick={() => setAskOpen(true)}
                disabled={updateStatus.isPending}
                className="touch-target rounded-2xl border border-amber-300 bg-amber-50 px-5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                Ask the customer
              </button>
              <button
                type="button"
                onClick={() => setRejectOpen(true)}
                disabled={updateStatus.isPending}
                className="touch-target rounded-2xl border border-red-300 bg-white px-5 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                Reject
              </button>
            </>
          )}

          {order.status === 'needs_clarification' && (
            <>
              <button
                type="button"
                onClick={() => advance('accepted')}
                disabled={updateStatus.isPending}
                className="touch-target rounded-2xl bg-teal px-5 text-sm font-bold text-white hover:bg-teal-dark disabled:opacity-50"
              >
                Customer replied, accept
              </button>
              <button
                type="button"
                onClick={() => setRejectOpen(true)}
                disabled={updateStatus.isPending}
                className="touch-target rounded-2xl border border-red-300 bg-white px-5 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                Reject
              </button>
            </>
          )}

          {order.status === 'accepted' && (
            <>
              <button
                type="button"
                onClick={() => advance('preparing')}
                disabled={updateStatus.isPending}
                className="touch-target rounded-2xl bg-vendor px-5 text-sm font-bold text-white hover:bg-vendor-dark disabled:opacity-50"
              >
                Mark preparing
              </button>
              <button
                type="button"
                onClick={() => setAskOpen(true)}
                disabled={updateStatus.isPending}
                className="touch-target rounded-2xl border border-amber-300 bg-amber-50 px-5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                Ask the customer
              </button>
            </>
          )}

          {order.status === 'preparing' && (
            <>
              <button
                type="button"
                onClick={() => advance('ready')}
                disabled={updateStatus.isPending}
                className="touch-target rounded-2xl bg-teal px-5 text-sm font-bold text-white hover:bg-teal-dark disabled:opacity-50"
              >
                Mark ready
              </button>
              <button
                type="button"
                onClick={() => setEtaOpen(true)}
                disabled={updateStatus.isPending}
                className="touch-target rounded-2xl bg-vendor px-5 text-sm font-bold text-white hover:bg-vendor-dark disabled:opacity-50"
              >
                Mark dispatched
              </button>
            </>
          )}

          {order.status === 'ready' && (
            <>
              <button
                type="button"
                onClick={() => setEtaOpen(true)}
                disabled={updateStatus.isPending}
                className="touch-target rounded-2xl bg-vendor px-5 text-sm font-bold text-white hover:bg-vendor-dark disabled:opacity-50"
              >
                Mark dispatched
              </button>
              <button
                type="button"
                onClick={() => advance('delivered')}
                disabled={updateStatus.isPending}
                className="touch-target rounded-2xl bg-teal px-5 text-sm font-bold text-white hover:bg-teal-dark disabled:opacity-50"
              >
                Mark collected
              </button>
            </>
          )}

          {order.status === 'dispatched' && (
            <button
              type="button"
              onClick={() => advance('delivered')}
              disabled={updateStatus.isPending}
              className="touch-target rounded-2xl bg-teal px-5 text-sm font-bold text-white hover:bg-teal-dark disabled:opacity-50"
            >
              Mark delivered
            </button>
          )}

          {isAmendable.includes(order.status) && !pendingAmendment && (
            <button
              type="button"
              onClick={() => setAmendOpen(true)}
              disabled={proposeAmendment.isPending}
              className="touch-target rounded-2xl border border-border bg-white px-5 text-sm font-semibold text-vendor hover:bg-surface"
            >
              Suggest a change
            </button>
          )}

          {(order.status === 'cancelled' ||
            order.status === 'rejected' ||
            order.status === 'refunded' ||
            order.status === 'delivered') && (
            <p className="text-sm text-mid">
              This order is closed. No further actions available.
            </p>
          )}
        </div>
      </section>

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

      <NeedsClarificationSheet
        open={askOpen}
        onOpenChange={setAskOpen}
        orderNumber={order.orderNumber}
        busy={updateStatus.isPending}
        onConfirm={(question) => {
          updateStatus.mutate(
            {
              orderId: order.id,
              status: 'needs_clarification',
              clarificationNote: question,
            },
            { onSettled: () => setAskOpen(false) },
          );
        }}
      />
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={cn('text-sm', muted ? 'text-mid' : 'text-dark')}>{label}</dt>
      <dd
        className={cn(
          'tabular-nums',
          bold ? 'text-base font-bold' : 'text-sm',
          accent ? 'text-brand' : muted ? 'text-mid' : 'text-dark',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

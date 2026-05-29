'use client';

import { PaymentRequestButtonElement, useStripe } from '@stripe/react-stripe-js';
import type { PaymentRequest } from '@stripe/stripe-js';
import { useEffect, useRef, useState } from 'react';

/** Signals the native Apple Pay / Google Pay sheet to dismiss. Idempotent. */
export type ExpressPayComplete = (status: 'success' | 'fail') => void;

/**
 * Apple Pay / Google Pay express checkout button (Stripe Payment Request).
 *
 * Renders `null` when the device/browser has no enrolled wallet, so the card
 * form below remains the only payment option - this is the correct fallback,
 * NOT an error state (do not show a "not supported" message).
 *
 * `totalPence` MUST equal the amount that will actually be charged: the native
 * sheet shows this figure to the customer before they authorise, so the caller
 * is responsible for only rendering this button when the exact total is known.
 */
export function AppleGooglePayButton({
  totalPence,
  label,
  disabled = false,
  onPaymentMethod,
}: {
  totalPence: number;
  label: string;
  disabled?: boolean;
  onPaymentMethod: (
    paymentMethodId: string,
    complete: ExpressPayComplete,
  ) => void | Promise<void>;
}) {
  const stripe = useStripe();
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [available, setAvailable] = useState(false);

  // Always invoke the latest handler without re-registering the Stripe
  // 'paymentmethod' listener (which we attach once per PaymentRequest).
  const handlerRef = useRef(onPaymentMethod);
  handlerRef.current = onPaymentMethod;

  useEffect(() => {
    if (!stripe || totalPence <= 0) return;

    const pr = stripe.paymentRequest({
      country: 'GB',
      currency: 'gbp',
      total: { label, amount: totalPence },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    let active = true;
    void pr.canMakePayment().then((result) => {
      if (!active) return;
      if (result) {
        setPaymentRequest(pr);
        setAvailable(true);
      }
    });

    pr.on('paymentmethod', (ev) => {
      // Stripe rejects a second complete() call, so wrap it to be idempotent:
      // the caller can safely signal failure in a catch even after success.
      let settled = false;
      const complete: ExpressPayComplete = (status) => {
        if (settled) return;
        settled = true;
        ev.complete(status);
      };
      void handlerRef.current(ev.paymentMethod.id, complete);
    });

    return () => {
      active = false;
    };
    // Re-creating the PaymentRequest on every total change would re-open
    // listeners; instead we keep the amount in sync via pr.update() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe]);

  // Keep the displayed amount in sync so the native sheet always reflects the
  // exact amount we will charge.
  useEffect(() => {
    if (!paymentRequest || totalPence <= 0) return;
    paymentRequest.update({ total: { label, amount: totalPence } });
  }, [paymentRequest, totalPence, label]);

  if (!available || !paymentRequest) return null;

  return (
    <div className="space-y-3">
      <div className={disabled ? 'pointer-events-none opacity-50' : undefined}>
        <PaymentRequestButtonElement
          options={{
            paymentRequest,
            style: {
              paymentRequestButton: { type: 'default', theme: 'dark', height: '48px' },
            },
          }}
        />
      </div>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-cream-deep" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-charcoal-mid">
          or pay by card
        </span>
        <span className="h-px flex-1 bg-cream-deep" />
      </div>
    </div>
  );
}

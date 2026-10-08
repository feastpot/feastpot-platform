'use client';

import {
  CardElement,
  Elements,
  ExpressCheckoutElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import type { PaymentIntentResult, StripeElementsOptions } from '@stripe/stripe-js';
import { useMemo, useRef, useState } from 'react';
import { getStripe } from '@/lib/stripe';
import { requireMatchingWalletIntent } from '@/lib/wallet-payment-validation';

export type ExpressPayComplete = (status: 'success' | 'fail') => void;
export type ConfirmWalletPayment = (clientSecret: string) => Promise<PaymentIntentResult>;

const formatPounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;

export function AppleGooglePayButton({
  totalPence,
  label,
  disabled = false,
  captureMethod = 'manual',
  showCardFallback = false,
  clientSecret,
  onCardPayment,
  onPaymentMethod,
}: {
  totalPence: number;
  label: string;
  disabled?: boolean;
  captureMethod?: 'manual' | 'automatic';
  showCardFallback?: boolean;
  clientSecret?: string;
  onCardPayment?: (result: PaymentIntentResult) => void | Promise<void>;
  onPaymentMethod: (
    confirmWalletPayment: ConfirmWalletPayment,
    complete: ExpressPayComplete,
  ) => void | Promise<void>;
}) {
  const stripePromise = useMemo(() => getStripe(), []);
  const options = useMemo<StripeElementsOptions>(
    () => ({
      mode: 'payment',
      amount: totalPence,
      currency: 'gbp',
      paymentMethodTypes: ['card'],
      captureMethod,
    }),
    [totalPence, captureMethod],
  );

  if (!stripePromise || totalPence <= 0) return null;
  return (
    <Elements stripe={stripePromise} options={options}>
      <WalletControls
        totalPence={totalPence}
        label={label}
        disabled={disabled}
        captureMethod={captureMethod}
        showCardFallback={showCardFallback}
        clientSecret={clientSecret}
        onCardPayment={onCardPayment}
        onPaymentMethod={onPaymentMethod}
      />
    </Elements>
  );
}

function WalletControls({
  totalPence,
  label,
  disabled,
  captureMethod,
  showCardFallback,
  clientSecret,
  onCardPayment,
  onPaymentMethod,
}: {
  totalPence: number;
  label: string;
  disabled: boolean;
  captureMethod: 'manual' | 'automatic';
  showCardFallback: boolean;
  clientSecret?: string;
  onCardPayment?: (result: PaymentIntentResult) => void | Promise<void>;
  onPaymentMethod: (
    confirmWalletPayment: ConfirmWalletPayment,
    complete: ExpressPayComplete,
  ) => void | Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [walletsReady, setWalletsReady] = useState(false);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const selectedAmountRef = useRef<number | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const handlerRef = useRef(onPaymentMethod);
  handlerRef.current = onPaymentMethod;
  const cardHandlerRef = useRef(onCardPayment);
  cardHandlerRef.current = onCardPayment;

  const confirmWalletPayment: ConfirmWalletPayment = async (clientSecret) => {
    if (!stripe || !elements) throw new Error('Payment system is not ready.');
    const retrieved = await stripe.retrievePaymentIntent(clientSecret);
    if (retrieved.error) return { error: retrieved.error };
    const intent = retrieved.paymentIntent;
    if (selectedAmountRef.current !== null && selectedAmountRef.current !== totalPence) {
      throw new Error(
        'The amount has changed since you opened your wallet. Please review it again.',
      );
    }
    requireMatchingWalletIntent(intent, totalPence, captureMethod);
    if (!intent) throw new Error('Payment is unavailable. Please try again.');
    if (intent.status === 'succeeded' || intent.status === 'requires_capture') {
      return { paymentIntent: intent };
    }
    return stripe.confirmPayment({ elements, clientSecret, redirect: 'if_required' });
  };

  if (walletsReady && !walletAvailable && !showCardFallback) return null;

  return (
    <div className="space-y-3" aria-label={`${label}, ${formatPounds(totalPence)}`}>
      <div className={walletsReady && !walletAvailable ? 'hidden' : 'relative'}>
        <div
          className={
            !walletsReady || disabled || busy ? 'pointer-events-none opacity-0' : undefined
          }
          inert={!walletsReady || disabled || busy}
        >
          <ExpressCheckoutElement
            onClick={(event) => {
              if (disabled || busyRef.current || !stripe || !elements) {
                return;
              }
              selectedAmountRef.current = totalPence;
              setPaymentError(null);
              event.resolve({ lineItems: [{ name: label, amount: totalPence }] });
            }}
            onCancel={() => {
              selectedAmountRef.current = null;
            }}
            onReady={({ availablePaymentMethods }) => {
              setWalletAvailable(
                Boolean(availablePaymentMethods?.applePay || availablePaymentMethods?.googlePay),
              );
              setWalletsReady(true);
            }}
            onConfirm={async (event) => {
              if (disabled || busyRef.current || !stripe || !elements) {
                event.paymentFailed({ reason: 'fail' });
                return;
              }
              busyRef.current = true;
              setBusy(true);
              let failureSignaled = false;
              const complete: ExpressPayComplete = (status) => {
                if (status !== 'fail' || failureSignaled) return;
                failureSignaled = true;
                event.paymentFailed({ reason: 'fail' });
              };
              try {
                const submission = await elements.submit();
                if (submission.error) throw submission.error;
                await handlerRef.current(confirmWalletPayment, complete);
              } catch {
                setPaymentError(
                  'Could not complete your wallet payment. Please review the amount and try again.',
                );
                complete('fail');
              } finally {
                busyRef.current = false;
                setBusy(false);
              }
            }}
            options={{
              buttonHeight: 48,
              buttonTheme: { applePay: 'black', googlePay: 'black' },
              buttonType: { applePay: 'plain', googlePay: 'plain' },
              paymentMethodOrder: ['apple_pay', 'google_pay'],
              paymentMethods: {
                applePay: 'auto',
                googlePay: 'auto',
                link: 'never',
                paypal: 'never',
                amazonPay: 'never',
              },
            }}
          />
        </div>
        {!walletsReady && (
          <div
            className="absolute inset-0 animate-pulse rounded-xl bg-cream-deep/60"
            aria-hidden="true"
          />
        )}
      </div>
      {walletAvailable && walletsReady && (
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-cream-deep" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-charcoal-mid">
            or pay by card
          </span>
          <span className="h-px flex-1 bg-cream-deep" />
        </div>
      )}
      {paymentError && (
        <p role="alert" className="text-sm font-medium text-scotch">
          {paymentError}
        </p>
      )}
      {showCardFallback && (
        <>
          <div className="rounded-2xl border border-cream-deep bg-white p-3">
            <CardElement options={{ style: { base: { fontSize: '16px' } } }} />
          </div>
          {clientSecret && cardHandlerRef.current && (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={async () => {
                if (!stripe || !elements || !clientSecret || busyRef.current) return;
                busyRef.current = true;
                setBusy(true);
                try {
                  const retrieved = await stripe.retrievePaymentIntent(clientSecret);
                  if (retrieved.error) throw retrieved.error;
                  const intent = retrieved.paymentIntent;
                  requireMatchingWalletIntent(intent, totalPence, captureMethod);
                  if (!intent) throw new Error('Payment is unavailable. Please try again.');
                  if (intent.status === 'succeeded' || intent.status === 'requires_capture') {
                    await cardHandlerRef.current?.({ paymentIntent: intent });
                    return;
                  }
                  const card = elements.getElement(CardElement);
                  if (!card) throw new Error('Please enter your card details.');
                  const result = await stripe.confirmCardPayment(clientSecret, {
                    payment_method: { card },
                  });
                  await cardHandlerRef.current?.(result);
                } catch (error) {
                  await cardHandlerRef.current?.({
                    error: error as NonNullable<PaymentIntentResult['error']>,
                  });
                } finally {
                  busyRef.current = false;
                  setBusy(false);
                }
              }}
              className="w-full rounded-xl bg-brand py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? 'Processing…' : `Pay ${formatPounds(totalPence)} by card`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

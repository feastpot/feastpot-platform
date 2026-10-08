'use client';

import {
  AppleGooglePayButton,
  type ConfirmWalletPayment,
  type ExpressPayComplete,
} from '@/components/checkout/payment-request-button';
import { apiRequest } from '@/lib/api/client';
import { STRIPE_CONFIGURED, getStripe } from '@/lib/stripe';
import { userErrorMessage } from '@/lib/user-error-message';
import { requireMatchingWalletIntent } from '@/lib/wallet-payment-validation';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Purpose = 'deposit' | 'balance';
type PaymentLinkResponse = { clientSecret: string; depositPence?: number; balancePence?: number };

const validUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;

export function CateringPaymentClient({
  bookingId,
  purpose,
}: {
  bookingId: string;
  purpose: Purpose;
}) {
  const [amount, setAmount] = useState<number | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [stage, setStage] = useState<'start' | 'loading' | 'pay' | 'authorised' | 'confirmed'>(
    'start',
  );
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const requestMadeRef = useRef(false);

  const createPayment = async () => {
    if (!validUuid(bookingId)) {
      setError('This payment link is not valid. Please check the link in your email.');
      return;
    }
    if (workingRef.current || requestMadeRef.current || stage !== 'start') return;
    workingRef.current = true;
    setWorking(true);
    setStage('loading');
    setError(null);
    let paymentCreated = false;
    try {
      const response = await apiRequest<PaymentLinkResponse>(
        `/catering-bookings/${bookingId}/${purpose}`,
        { method: 'POST' },
      );
      requestMadeRef.current = true;
      paymentCreated = true;
      const exactAmount = purpose === 'deposit' ? response.depositPence : response.balancePence;
      if (
        !response.clientSecret ||
        !Number.isInteger(exactAmount) ||
        !exactAmount ||
        exactAmount <= 0
      ) {
        throw new Error('We could not verify the amount due. Please contact Feastpot support.');
      }
      setAmount(exactAmount);
      setClientSecret(response.clientSecret);
      setStage('pay');
      const stripe = await getStripe();
      if (!stripe)
        throw new Error('Payments are unavailable at the moment. Please try again later.');
      const retrieved = await stripe.retrievePaymentIntent(response.clientSecret);
      if (retrieved.error) throw retrieved.error;
      const intent = retrieved.paymentIntent;
      requireMatchingWalletIntent(intent, exactAmount, 'automatic');
      if (!intent) throw new Error('Payment is unavailable. Please try again.');
      setPaymentIntentId(intent.id);
      if (intent.status === 'succeeded') {
        setStage('authorised');
        await confirmBooking(intent.id);
      } else {
        setStage('pay');
      }
    } catch (e) {
      setStage(paymentCreated ? 'pay' : 'start');
      setError(await messageFor(e, 'We could not prepare this payment. Please try again.'));
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  };

  const confirmBooking = async (intentId: string) => {
    workingRef.current = true;
    setWorking(true);
    try {
      await apiRequest(`/catering-bookings/${bookingId}/confirm-${purpose}`, {
        method: 'POST',
        body: { paymentIntentId: intentId },
      });
      setStage('confirmed');
      setError(null);
    } catch (e) {
      setStage('authorised');
      setError(
        await messageFor(
          e,
          'Your payment was received, but booking confirmation is still pending. Please retry confirmation.',
        ),
      );
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  };

  const paymentComplete = async (
    result: Awaited<ReturnType<ConfirmWalletPayment>>,
    complete?: ExpressPayComplete,
  ) => {
    if (result.error) {
      complete?.('fail');
      setError(await messageFor(result.error, 'Could not complete your payment.'));
      return;
    }
    const intent = result.paymentIntent;
    if (!intent || intent.status !== 'succeeded') {
      complete?.('fail');
      setError(`Payment is not complete yet (${intent?.status ?? 'unknown'}). Please try again.`);
      return;
    }
    setPaymentIntentId(intent.id);
    setStage('authorised');
    complete?.('success');
    await confirmBooking(intent.id);
  };

  const onWallet = async (confirm: ConfirmWalletPayment, complete: ExpressPayComplete) => {
    if (!clientSecret || stage !== 'pay') {
      complete('fail');
      return;
    }
    await paymentComplete(await confirm(clientSecret), complete);
  };

  const retryConfirm = async () => {
    if (!paymentIntentId || workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    await confirmBooking(paymentIntentId);
    workingRef.current = false;
    setWorking(false);
  };

  if (!validUuid(bookingId)) {
    return (
      <PaymentShell title="Payment link unavailable">
        <p role="alert" className="text-sm text-scotch">
          This payment link is not valid. Please check the link in your email.
        </p>
      </PaymentShell>
    );
  }
  if (!STRIPE_CONFIGURED) {
    return (
      <PaymentShell title="Payment unavailable">
        <p className="text-sm text-charcoal-mid">
          Payments are temporarily unavailable. Please contact Feastpot support.
        </p>
      </PaymentShell>
    );
  }

  return (
    <PaymentShell
      title={purpose === 'deposit' ? 'Pay your catering deposit' : 'Pay your catering balance'}
    >
      {stage === 'start' && (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-charcoal-mid">
            Continue to securely retrieve the amount due and choose Apple Pay, Google Pay or card.
          </p>
          <button
            type="button"
            onClick={createPayment}
            disabled={working}
            className="w-full rounded-xl bg-brand px-4 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            Continue to payment
          </button>
        </div>
      )}
      {stage === 'loading' && (
        <p
          role="status"
          className="rounded-xl bg-cream-warm p-4 text-sm font-medium text-charcoal-mid"
        >
          Preparing your secure payment…
        </p>
      )}
      {stage === 'pay' && amount != null && clientSecret && (
        <div className="space-y-4">
          <div className="rounded-xl bg-cream-warm p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-charcoal-mid">
              {purpose === 'deposit' ? 'Deposit due' : 'Balance due'}
            </p>
            <p className="mt-1 font-display text-3xl font-black text-charcoal">{pounds(amount)}</p>
          </div>
          <AppleGooglePayButton
            totalPence={amount}
            label="Feastpot catering"
            captureMethod="automatic"
            clientSecret={clientSecret}
            showCardFallback
            disabled={working}
            onPaymentMethod={onWallet}
            onCardPayment={(result) => paymentComplete(result)}
          />
        </div>
      )}
      {stage === 'authorised' && (
        <div className="space-y-3">
          <p
            role="status"
            className="rounded-xl border border-brand/30 bg-brand/10 p-4 text-sm font-medium text-brand-dark"
          >
            Payment received. We are completing your booking confirmation.
          </p>
          <button
            type="button"
            onClick={retryConfirm}
            disabled={working || !paymentIntentId}
            className="w-full rounded-xl bg-brand px-4 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {working ? 'Confirming…' : 'Retry booking confirmation'}
          </button>
        </div>
      )}
      {stage === 'confirmed' && (
        <p
          role="status"
          className="rounded-xl border border-brand/30 bg-brand/10 p-4 text-sm font-bold text-brand-dark"
        >
          {purpose === 'deposit'
            ? 'Your catering deposit is paid and your booking is confirmed.'
            : 'Your catering balance is paid and your booking is confirmed.'}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-scotch/10 p-3 text-sm font-medium text-scotch">
          {error}
        </p>
      )}
      <p className="border-t border-cream-deep pt-4 text-xs leading-5 text-charcoal-mid">
        By continuing, you agree to our{' '}
        <a className="font-bold underline" href="/legal/terms">
          Terms
        </a>{' '}
        and acknowledge our{' '}
        <a className="font-bold underline" href="/legal/privacy">
          Privacy Policy
        </a>
        .
      </p>
    </PaymentShell>
  );
}

function PaymentShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-cream px-4 py-10 text-charcoal">
      <section className="mx-auto max-w-md rounded-2xl border border-cream-deep bg-white p-5 shadow-sm sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-brand">
          Feastpot catering
        </p>
        <h1 className="mt-2 font-display text-2xl font-black tracking-tight">{title}</h1>
        <div className="mt-5 space-y-4">{children}</div>
      </section>
    </main>
  );
}

async function messageFor(error: unknown, fallback: string) {
  return userErrorMessage(error, fallback);
}

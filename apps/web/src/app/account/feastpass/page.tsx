'use client';

import { ArrowRight, Check, Crown, Loader2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { useAccessToken } from '@/lib/auth/use-access-token';
import {
  createFeastPassCheckout,
  createFeastPassPortal,
  getFeastPassMembership,
  type FeastPassMembership,
} from '@/lib/api/feastpass';

type Status = 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

const STATUS_LABEL: Record<Status, string> = {
  ACTIVE: 'Active',
  PAST_DUE: 'Payment past due',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

const STATUS_COLOUR: Record<Status, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  PAST_DUE: 'bg-yellow-100 text-yellow-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
  EXPIRED: 'bg-red-100 text-red-700',
};

function formatDate(d: string | null | undefined) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatPounds(p: number) {
  return `£${(p / 100).toFixed(2)}`;
}

function FeastPassInner() {
  const { token } = useAccessToken();
  const params = useSearchParams();
  const justSucceeded = params.get('success') === '1';

  const { data, isLoading, error, refetch } = useQuery<FeastPassMembership>({
    queryKey: ['feastpass-me'],
    queryFn: () => getFeastPassMembership(token!),
    enabled: !!token,
  });

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Refetch once after a successful Stripe redirect so the status updates
  useEffect(() => {
    if (justSucceeded) {
      const t = setTimeout(() => void refetch(), 1500);
      return () => clearTimeout(t);
    }
  }, [justSucceeded, refetch]);

  async function openPortal() {
    if (!token) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const { url } = await createFeastPassPortal(
        token,
        `${window.location.origin}/account/feastpass`,
      );
      window.location.href = url;
    } catch {
      setActionError('Could not open the management portal. Please try again.');
      setActionLoading(false);
    }
  }

  async function openCheckout(plan: 'MONTHLY' | 'ANNUAL') {
    if (!token) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const origin = window.location.origin;
      const { url } = await createFeastPassCheckout(
        token,
        plan,
        `${origin}/account/feastpass?success=1`,
        `${origin}/account/feastpass`,
      );
      window.location.href = url;
    } catch {
      setActionError('Something went wrong. Please try again.');
      setActionLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="px-4 py-8 text-center text-sm text-destructive">
        Could not load membership details.
      </p>
    );
  }

  const sub = data?.subscription;
  const savings = data?.savings;
  const isMember = sub?.status === 'ACTIVE';

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <Crown className="h-5 w-5 text-brand" aria-hidden />
        <h1 className="font-display text-xl font-black text-charcoal">FeastPass</h1>
      </div>

      {justSucceeded && (
        <div className="flex items-center gap-2 rounded-2xl bg-green-50 border border-green-200 px-4 py-3">
          <Check className="h-4 w-4 text-green-600" aria-hidden />
          <p className="text-sm font-bold text-green-800">
            Welcome to FeastPass! Your membership is active.
          </p>
        </div>
      )}

      {/* Active / non-member */}
      {sub ? (
        <>
          {/* Status card */}
          <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-charcoal-mid">
                  Current plan
                </p>
                <p className="mt-0.5 font-display text-lg font-black text-charcoal">
                  FeastPass {sub.plan === 'ANNUAL' ? 'Annual' : 'Monthly'}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLOUR[sub.status as Status] ?? ''}`}
              >
                {STATUS_LABEL[sub.status as Status] ?? sub.status}
              </span>
            </div>

            {sub.status === 'ACTIVE' && (
              <p className="mt-2 text-sm font-medium text-charcoal-mid">
                {sub.cancelAtPeriodEnd
                  ? `Cancels on ${formatDate(sub.currentPeriodEnd)}`
                  : `Renews on ${formatDate(sub.currentPeriodEnd)}`}
              </p>
            )}
            {sub.status === 'PAST_DUE' && (
              <p className="mt-2 text-sm font-medium text-yellow-700">
                Payment failed. Please update your card to keep your benefits.
              </p>
            )}
            {(sub.status === 'CANCELLED' || sub.status === 'EXPIRED') && (
              <p className="mt-2 text-sm font-medium text-charcoal-mid">
                Membership ended{sub.cancelledAt ? ` on ${formatDate(sub.cancelledAt)}` : ''}.
              </p>
            )}
          </div>

          {/* Savings tracker */}
          {savings && (savings.totalSavedPence > 0 || isMember) && (
            <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-card">
              <p className="text-xs font-black uppercase tracking-wider text-charcoal-mid">
                Cumulative savings
              </p>
              <p className="mt-1 font-display text-3xl font-black text-brand">
                {formatPounds(savings.totalSavedPence)}
              </p>
              <p className="mt-0.5 text-sm font-medium text-charcoal-mid">
                saved across {savings.orderCount} order{savings.orderCount !== 1 ? 's' : ''} as a
                member
              </p>
              <p className="mt-2 text-xs text-charcoal-mid">
                Based on orders placed through Feastpot. Orders through a kitchen&apos;s own link
                are not included.
              </p>
            </div>
          )}

          {/* Manage / rejoin */}
          {actionError && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3">
              <XCircle className="h-4 w-4 text-destructive" />
              <p className="text-sm text-destructive">{actionError}</p>
            </div>
          )}

          {(sub.status === 'ACTIVE' || sub.status === 'PAST_DUE') && (
            <button
              type="button"
              onClick={openPortal}
              disabled={actionLoading}
              className="flex w-full items-center justify-between rounded-2xl border border-cream-deep bg-white px-5 py-4 shadow-card transition-colors hover:border-brand/30 hover:bg-brand-light disabled:opacity-60"
            >
              <span className="font-bold text-charcoal">
                {sub.status === 'PAST_DUE' ? 'Update payment method' : 'Manage or cancel'}
              </span>
              {actionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand" />
              ) : (
                <ArrowRight className="h-4 w-4 text-brand" />
              )}
            </button>
          )}

          {(sub.status === 'CANCELLED' || sub.status === 'EXPIRED') && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-charcoal">Rejoin FeastPass</p>
              <button
                type="button"
                onClick={() => openCheckout('ANNUAL')}
                disabled={actionLoading}
                className="flex w-full items-center justify-between rounded-2xl bg-brand px-5 py-4 text-white shadow-card hover:bg-brand-dark disabled:opacity-60"
              >
                <span className="font-bold">
                  Annual - £39.90 <span className="text-xs opacity-80">(2 months free)</span>
                </span>
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => openCheckout('MONTHLY')}
                disabled={actionLoading}
                className="flex w-full items-center justify-between rounded-2xl border border-cream-deep bg-white px-5 py-4 shadow-card hover:border-brand/30 hover:bg-brand-light disabled:opacity-60"
              >
                <span className="font-bold text-charcoal">Monthly - £3.99/mo</span>
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-brand" />
                ) : (
                  <ArrowRight className="h-4 w-4 text-brand" />
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        /* Not a member */
        <div className="space-y-4">
          <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-card text-center">
            <p className="font-display text-lg font-black text-charcoal">Not a member yet</p>
            <p className="mt-1 text-sm font-medium text-charcoal-mid">
              Join FeastPass and never pay a service fee again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCheckout('ANNUAL')}
            disabled={actionLoading}
            className="touch-target w-full rounded-2xl bg-brand py-4 text-center text-base font-bold text-white shadow-card hover:bg-brand-dark disabled:opacity-60"
          >
            {actionLoading ? 'Redirecting…' : 'Join FeastPass - £39.90/year'}
          </button>
          <Link
            href="/feastpass"
            className="block text-center text-sm font-medium text-charcoal-mid hover:text-charcoal"
          >
            Learn more about FeastPass →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function FeastPassPage() {
  return (
    <Suspense>
      <FeastPassInner />
    </Suspense>
  );
}

'use client';

import { Check, Copy, Gift, Share2 } from 'lucide-react';
import { useState } from 'react';

import { useReferrals } from '@/hooks/use-referrals';
// Note: useReferrals is re-exported from use-loyalty for convenience.

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

/**
 * Referral card — exposes the user's stable share code + URL, lets them
 * copy or use the Web Share API, and shows a count of friends rewarded
 * so far (FR-REF-001).
 */
export function ReferralCard() {
  const { data, isLoading, isError } = useReferrals();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (!data?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(data.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — fall through, button stays in idle state.
    }
  };

  const onShare = async () => {
    if (!data?.shareUrl) return;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: 'Try Feastpot',
          text: 'Get £5 off your first Feastpot order with my code:',
          url: data.shareUrl,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      await onCopy();
    }
  };

  const rewardedCount = data?.referrals.filter((r) => r.status === 'rewarded').length ?? 0;
  const pendingCount = data?.referrals.filter((r) => r.status === 'pending').length ?? 0;

  return (
    <section className="rounded-2xl border border-cream-deep bg-white p-4 shadow-card">
      <header className="mb-3 flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light"
          aria-hidden
        >
          <Gift className="h-4 w-4 text-brand" />
        </span>
        <h2 className="font-display text-base font-black text-charcoal">Refer a friend</h2>
      </header>

      <p className="text-sm font-medium text-charcoal-mid">
        Share your code — when a friend places their first order, you both get{' '}
        <span className="font-bold text-charcoal">500 points (£5)</span>.
      </p>

      {isLoading ? (
        <p className="mt-3 text-sm font-medium text-charcoal-mid">Loading…</p>
      ) : isError || !data ? (
        <p className="mt-3 text-sm font-medium text-charcoal-mid">
          Sign in to get your referral code.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-stretch gap-2">
            <code className="flex flex-1 items-center rounded-xl border border-dashed border-brand/40 bg-cream px-3 py-2 text-base font-black tracking-wider text-brand">
              {data.referralCode}
            </code>
            <button
              type="button"
              onClick={onCopy}
              className="flex items-center justify-center gap-1 rounded-xl bg-brand px-3 text-sm font-bold text-white hover:bg-brand-dark"
              aria-label="Copy referral code"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onShare}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-cream-deep bg-white px-3 py-2 text-sm font-bold text-charcoal hover:bg-cream"
          >
            <Share2 className="h-4 w-4" aria-hidden />
            Share link
          </button>

          {(rewardedCount > 0 || pendingCount > 0) && (
            <div className="mt-4 flex justify-between text-xs font-medium text-charcoal-mid">
              <span>
                <span className="font-bold text-brand">{rewardedCount}</span> rewarded ·{' '}
                <span className="font-bold text-charcoal">{pendingCount}</span> pending
              </span>
              <span>Earned {formatPounds(data.totalEarnedPence)} so far</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

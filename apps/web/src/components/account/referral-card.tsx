'use client';

import { Check, Copy, Gift, Share2 } from 'lucide-react';
import { useState } from 'react';

import { useReferrals } from '@/hooks/use-referrals';
// Note: useReferrals is re-exported from use-loyalty for convenience.

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

/**
 * "Give £5, Get £5" referral card — wireframe-spec green panel with a
 * cream code input, gold Invite Now CTA, and a small rewarded/pending
 * status row. Uses the Web Share API where available, falls back to
 * copy-to-clipboard.
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
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-dark p-5 text-white shadow-card">
      {/* Decorative gift glyph in the top-right corner — purely cosmetic. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-4 -top-4 grid h-24 w-24 rotate-12 place-items-center rounded-3xl bg-plantain/90 text-charcoal shadow-lg"
      >
        <Gift className="h-10 w-10" />
      </div>

      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-plantain">
        Refer a friend
      </p>
      <h2 className="mt-1 font-display text-2xl font-black tracking-tight">
        Give £5, Get £5
      </h2>
      <p className="mt-1.5 max-w-[22ch] text-sm font-medium text-white/85">
        Share your code — friends get £5 off their first order over £20 and you get
        500 feastpoints (£5).
      </p>

      {isLoading ? (
        <p className="mt-4 text-sm font-bold text-white/85">Loading your code…</p>
      ) : isError || !data ? (
        <p className="mt-4 text-sm font-bold text-white/85">
          Sign in to grab your referral code.
        </p>
      ) : (
        <>
          {/* Code chip + copy button — code lives in a cream pill so it's
              easy to spot against the green panel. */}
          <div className="mt-4 flex items-stretch gap-2 rounded-2xl bg-white p-1.5 shadow-sm">
            <code className="flex flex-1 items-center px-3 text-base font-black tracking-[0.18em] text-brand">
              {data.referralCode}
            </code>
            <button
              type="button"
              onClick={onCopy}
              aria-label="Copy referral code"
              className="touch-target inline-flex items-center justify-center gap-1 rounded-xl bg-cream-warm px-3 py-2 text-xs font-black text-charcoal hover:bg-cream-deep"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </>
              )}
            </button>
          </div>

          {/* Action row — Share / Invite Now in plantain gold. */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onShare}
              className="touch-target inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/30 bg-white/10 px-3 py-2.5 text-sm font-black text-white backdrop-blur-sm hover:bg-white/20"
            >
              <Share2 className="h-4 w-4" aria-hidden />
              Share link
            </button>
            <button
              type="button"
              onClick={onShare}
              className="touch-target inline-flex items-center justify-center rounded-2xl bg-plantain px-3 py-2.5 text-sm font-black text-charcoal shadow-sm hover:bg-plantain/90"
            >
              Invite now
            </button>
          </div>

          {(rewardedCount > 0 || pendingCount > 0) && (
            <div className="mt-4 flex items-center justify-between border-t border-white/15 pt-3 text-[11px] font-black uppercase tracking-wider text-white/85">
              <span>
                <span className="text-plantain">{rewardedCount}</span> rewarded ·{' '}
                <span className="text-white">{pendingCount}</span> pending
              </span>
              <span className="font-bold text-white/85">
                Earned {formatPounds(data.totalEarnedPence)} so far
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

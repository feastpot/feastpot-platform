'use client';

import { Users } from 'lucide-react';

import { useReferrals } from '@/hooks/use-referrals';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'bg-plantain/20 text-charcoal' },
  completed: { label: 'Completed', tone: 'bg-charcoal/10 text-charcoal' },
  rewarded: { label: 'Rewarded', tone: 'bg-brand-light text-brand' },
};

/**
 * Referral history panel for /account. Only renders when the customer has at
 * least one referral - the ReferralCard above already handles the "share your
 * code" pitch, so an empty history list would just add noise.
 */
export function ReferralHistory() {
  const { data } = useReferrals();
  if (!data || data.referrals.length === 0) return null;

  return (
    <section className="rounded-3xl border border-cream-deep bg-white p-4 shadow-card">
      <header className="mb-3 flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-charcoal-mid">
          <Users className="h-3.5 w-3.5 text-brand" aria-hidden />
          Your referrals
        </p>
        <span className="text-[11px] font-black text-brand">
          {formatPounds(data.totalEarnedPence)} earned
        </span>
      </header>
      <ul className="space-y-1.5">
        {data.referrals.map((r) => {
          const status = STATUS_LABEL[r.status] ?? STATUS_LABEL.pending!;
          return (
            <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-charcoal">
                  Friend joined {new Date(r.createdAt).toLocaleDateString('en-GB')}
                </p>
                {r.rewardedAt && (
                  <p className="text-[11px] font-medium text-charcoal-mid">
                    Rewarded {new Date(r.rewardedAt).toLocaleDateString('en-GB')}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {r.rewardPence != null && r.status === 'rewarded' && (
                  <span className="text-sm font-black tabular-nums text-brand">
                    +{formatPounds(r.rewardPence)}
                  </span>
                )}
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black ${status.tone}`}
                >
                  {status.label}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

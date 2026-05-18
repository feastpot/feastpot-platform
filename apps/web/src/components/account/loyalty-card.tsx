'use client';

import { Calendar, Gift, Sparkles, Star } from 'lucide-react';

import { useLoyalty } from '@/hooks/use-loyalty';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

const TX_LABEL: Record<string, string> = {
  earned: 'Earned',
  redeemed: 'Redeemed',
  expired: 'Expired',
  adjusted: 'Adjusted',
};

/** Membership tier derived from the running balance - purely cosmetic. */
function tierFor(balance: number): { label: string; tone: string } {
  if (balance >= 2500) return { label: 'Gold Member', tone: 'bg-plantain text-charcoal' };
  if (balance >= 1000) return { label: 'Silver Member', tone: 'bg-charcoal/10 text-charcoal' };
  return { label: 'Member', tone: 'bg-brand-light text-brand' };
}

/** Next reward milestone, used for the progress bar to the next perk. */
function nextMilestone(balance: number): { goal: number; remaining: number } {
  const tiers = [200, 500, 1000, 2500, 5000];
  const goal = tiers.find((t) => t > balance) ?? balance + 500;
  return { goal, remaining: Math.max(goal - balance, 0) };
}

/**
 * feastpoints panel - wireframe-spec loyalty surface. Green primary band
 * with the live balance + a progress bar to the next reward, three perks
 * underneath, and a collapsed ledger preview. Renders gracefully when the
 * API hasn't been wired (isError / isLoading) so /account doesn't blank.
 */
export function LoyaltyCard() {
  const { data, isLoading, isError } = useLoyalty();
  const balance = data?.balance ?? 0;
  const tier = tierFor(balance);
  const { goal, remaining } = nextMilestone(balance);
  const pct = Math.min(100, Math.round((balance / goal) * 100));

  return (
    <section className="overflow-hidden rounded-3xl border border-cream-deep bg-white shadow-card">
      {/* Header strip - feastpoints wordmark + tier pill. */}
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-baseline gap-1">
          <span className="font-display text-xl font-black tracking-tight text-brand">
            feast
          </span>
          <span className="font-display text-xl font-black tracking-tight text-charcoal">
            points
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-black ${tier.tone}`}
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          {tier.label}
        </span>
      </header>

      {/* Brand-green hero band with the live balance + progress. */}
      <div className="bg-gradient-to-br from-brand to-brand-dark px-4 py-5 text-white">
        {isLoading ? (
          <p className="text-sm font-bold opacity-90">Loading your points…</p>
        ) : isError || !data ? (
          <p className="text-sm font-bold opacity-90">
            Sign in to start earning feastpoints on every order.
          </p>
        ) : (
          <>
            <p className="font-display text-4xl font-black tabular-nums leading-none">
              {balance.toLocaleString()}
              <span className="ml-2 text-sm font-black uppercase tracking-wider opacity-80">
                pts
              </span>
            </p>
            <p className="mt-1 text-xs font-bold opacity-90">
              Worth {formatPounds(data.worthPence)} off your next order
            </p>

            {/* Progress to next reward */}
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-black uppercase tracking-wider opacity-90">
                <span>Next reward</span>
                <span>{remaining.toLocaleString()} pts to go</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-plantain transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Perk row - three tonal cells echoing the wireframe. */}
      <ul className="grid grid-cols-3 gap-2 border-t border-cream-deep bg-cream-warm/40 p-3">
        {[
          { Icon: Star, title: 'Earn points', body: 'With every order', tone: 'text-plantain' },
          { Icon: Gift, title: 'Exclusive offers', body: 'Members only', tone: 'text-brand' },
          { Icon: Calendar, title: 'Birthday treats', body: 'Something special', tone: 'text-scotch' },
        ].map(({ Icon, title, body, tone }) => (
          <li
            key={title}
            className="rounded-2xl bg-white p-2.5 text-center shadow-card"
          >
            <Icon className={`mx-auto h-4 w-4 ${tone}`} aria-hidden />
            <p className="mt-1 text-[11px] font-black leading-tight text-charcoal">{title}</p>
            <p className="text-[10px] font-medium leading-tight text-charcoal-mid">{body}</p>
          </li>
        ))}
      </ul>

      {/* Ledger preview - only render when we have history. */}
      {data && data.history.length > 0 && (
        <div className="border-t border-cream-deep px-4 py-3">
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-charcoal-mid">
            Recent activity
          </p>
          <ul className="space-y-1.5">
            {data.history.slice(0, 4).map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-charcoal">
                    {h.reason ?? TX_LABEL[h.type] ?? h.type}
                  </p>
                  <p className="text-[11px] font-medium text-charcoal-mid">
                    {new Date(h.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-black tabular-nums ${
                    h.points >= 0 ? 'text-brand' : 'text-charcoal-mid'
                  }`}
                >
                  {h.points >= 0 ? '+' : ''}
                  {h.points.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] font-medium text-charcoal-mid">
            Earn 1 point per £1 spent · 200 pt minimum to redeem · expires after 12 months.
          </p>
        </div>
      )}
    </section>
  );
}

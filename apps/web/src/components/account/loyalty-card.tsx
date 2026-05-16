'use client';

import { Sparkles } from 'lucide-react';

import { useLoyalty } from '@/hooks/use-loyalty';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

const TX_LABEL: Record<string, string> = {
  earned: 'Earned',
  redeemed: 'Redeemed',
  expired: 'Expired',
  adjusted: 'Adjusted',
};

/**
 * Loyalty balance card — shows the current points balance, its £ value,
 * and a short ledger preview. Lives on /account; safe to render before
 * the API endpoint exists (renders an empty state on 404).
 */
export function LoyaltyCard() {
  const { data, isLoading, isError } = useLoyalty();

  return (
    <section className="rounded-2xl border border-cream-deep bg-white p-4 shadow-card">
      <header className="mb-3 flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-plantain/20"
          aria-hidden
        >
          <Sparkles className="h-4 w-4 text-plantain" />
        </span>
        <h2 className="font-display text-base font-black text-charcoal">Loyalty points</h2>
      </header>

      {isLoading ? (
        <p className="text-sm font-medium text-charcoal-mid">Loading…</p>
      ) : isError || !data ? (
        <p className="text-sm font-medium text-charcoal-mid">Sign in to start earning points.</p>
      ) : (
        <>
          <div className="rounded-xl bg-gradient-to-br from-plantain/25 to-plantain/10 p-4">
            <p className="font-display text-3xl font-black tabular-nums text-charcoal">
              {data.balance.toLocaleString()}
              <span className="ml-1 text-sm font-bold text-charcoal-mid">pts</span>
            </p>
            <p className="mt-1 text-xs font-medium text-charcoal-mid">
              Worth {formatPounds(data.worthPence)} off your next order
              {data.balance < 200 && ' · 200pt minimum to redeem'}
            </p>
          </div>

          {data.history.length > 0 && (
            <ul className="mt-4 space-y-2">
              {data.history.slice(0, 5).map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-2 border-b border-cream-deep/60 pb-2 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-charcoal">
                      {h.reason ?? TX_LABEL[h.type] ?? h.type}
                    </p>
                    <p className="text-[11px] font-medium text-charcoal-mid">
                      {new Date(h.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-bold tabular-nums ${
                      h.points >= 0 ? 'text-brand' : 'text-charcoal-mid'
                    }`}
                  >
                    {h.points >= 0 ? '+' : ''}
                    {h.points.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-[11px] font-medium text-charcoal-mid">
            Earn 1 point per £1 spent. Points expire 12 months after they&rsquo;re earned.
          </p>
        </>
      )}
    </section>
  );
}

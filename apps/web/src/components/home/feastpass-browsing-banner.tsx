'use client';

import { Crown, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAccessToken } from '@/lib/auth/use-access-token';
import { getSavingsPotential } from '@/lib/api/feastpass';

const DISMISS_KEY = 'fp_browsing_banner_dismissed';

/**
 * Mobile-only FeastPass upsell banner shown on browsing surfaces (homepage,
 * vendor search). Hidden at md+ breakpoint.
 *
 * Suppression rules:
 *  - Confirmed FeastPass members: savingsPotentialPence === 0 from the API
 *    (the server short-circuits to 0 for active members), so we never
 *    annoy someone who already subscribes.
 *  - Dismissed via the close button: stored in sessionStorage so it
 *    reappears on the next visit / new tab (intentional - the spec does not
 *    ask for permanent suppression on the browsing surface).
 *  - Unauthenticated users: always shown (no token means no membership).
 *
 * Copy is verbatim from the task spec; do not edit without updating the spec.
 */
export function FeastPassBrowsingBanner() {
  const { token } = useAccessToken();
  const [dismissed, setDismissed] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [checked, setChecked] = useState(false);

  // Read sessionStorage dismissal on mount.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') {
        setDismissed(true);
      }
    } catch {
      // sessionStorage unavailable (private browsing, iframe sandbox): show the banner.
    }
    setChecked(true);
  }, []);

  // Check membership status for authenticated users.
  useEffect(() => {
    if (!token) return;
    getSavingsPotential(token)
      .then((data) => {
        if (data.savingsPotentialPence === 0) setIsMember(true);
      })
      .catch(() => {
        // Network error: default to showing the banner (safe failure).
      });
  }, [token]);

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // sessionStorage unavailable: dismiss is in-state only.
    }
    setDismissed(true);
  };

  // Wait for mount check so the banner never flashes then disappears.
  if (!checked || dismissed || isMember) return null;

  return (
    <div
      role="banner"
      aria-label="FeastPass promotion"
      className="relative mx-4 mt-4 rounded-2xl border border-plantain/40 bg-gradient-to-br from-plantain/10 via-white to-brand-light p-4 md:hidden"
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-charcoal-mid hover:bg-cream-deep"
        aria-label="Dismiss FeastPass banner"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-plantain/20"
          aria-hidden
        >
          <Crown className="h-4 w-4 text-plantain-dark" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-black text-charcoal">
            Skip the service fee with FeastPass
          </p>
          <p className="mt-0.5 text-xs font-medium leading-snug text-charcoal-mid">
            &pound;3.99 a month. Orders you place through Feastpot come with no service fee,
            which is up to &pound;2.99 an order.
          </p>
          <Link
            href="/feastpass"
            className="mt-2 inline-flex items-center gap-1 rounded-full bg-plantain px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-plantain-dark"
          >
            <Crown className="h-3 w-3" aria-hidden />
            See how it works
          </Link>
        </div>
      </div>
    </div>
  );
}

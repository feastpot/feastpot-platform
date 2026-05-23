'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@feastpot/ui';

/**
 * UK GDPR / PECR cookie notice.
 *
 * Feastpot only sets strictly-necessary cookies (auth session, basket,
 * CSRF). Under PECR these do NOT require prior opt-in - only a clear
 * notice. We still give the user an explicit choice between
 * "Essential only" and "Accept all" so the recorded preference is
 * unambiguous and future-proof if non-essential cookies are ever added.
 *
 * Stored values in localStorage:
 *   'essential' — user picked essential-only
 *   'all'       — user accepted everything
 *   'accepted'  — legacy value (treated as 'all')
 */
const STORAGE_KEY = 'feastpot.cookie-consent.v1';

type Consent = 'essential' | 'all';

function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'essential') return 'essential';
    if (raw === 'all' || raw === 'accepted') return 'all';
    return null;
  } catch {
    return null;
  }
}

export function CookieBanner() {
  // `undefined` = pre-hydration (don't render yet to avoid SSR mismatch);
  // `null` = no choice yet (show banner); otherwise the stored choice.
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);

  useEffect(() => {
    setConsent(readConsent());
  }, []);

  const choose = (value: Consent) => () => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
    setConsent(value);
  };

  if (consent === undefined || consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-cream-deep bg-white/95 px-4 py-3 shadow-lg backdrop-blur md:px-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm font-medium text-charcoal">
          We use cookies for essential platform functionality. No advertising cookies.{' '}
          <Link
            href="/legal/privacy"
            className="font-bold text-brand-dark underline underline-offset-2 hover:text-brand"
          >
            Read our privacy policy
          </Link>
          .
        </p>
        <div className="flex flex-wrap justify-end gap-2 self-end md:self-auto">
          <Button
            onClick={choose('essential')}
            variant="outline"
            size="sm"
            className="rounded-xl border-cream-deep font-bold text-charcoal hover:bg-cream"
          >
            Essential only
          </Button>
          <Button
            onClick={choose('all')}
            size="sm"
            className="rounded-xl bg-brand font-bold text-white hover:bg-brand-dark"
          >
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}

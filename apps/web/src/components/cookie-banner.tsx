'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@feastpot/ui';

/**
 * UK GDPR / PECR cookie notice.
 *
 * Feastpot only sets strictly-necessary cookies (auth session, basket,
 * CSRF). Under PECR these do NOT require prior opt-in — only a clear
 * notice. We therefore use a dismissable banner rather than a blocking
 * consent gate. State lives in localStorage so the banner doesn't reappear
 * on every navigation.
 */
const STORAGE_KEY = 'feastpot.cookie-consent.v1';

export function CookieBanner() {
  // `null` = pre-hydration (don't render yet to avoid SSR mismatch);
  // `true`/`false` once we've read localStorage.
  const [accepted, setAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setAccepted(localStorage.getItem(STORAGE_KEY) === 'accepted');
    } catch {
      // Private mode / blocked storage — show the banner anyway, dismissing
      // becomes a no-op which is acceptable behaviour.
      setAccepted(false);
    }
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'accepted');
    } catch {
      /* ignore */
    }
    setAccepted(true);
  };

  if (accepted !== false) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur md:px-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-foreground">
          We use cookies for essential platform functionality. No advertising cookies.{' '}
          <Link href="/legal/privacy" className="font-medium text-brand underline underline-offset-2">
            Read our privacy policy
          </Link>
          .
        </p>
        <Button onClick={handleAccept} className="self-end md:self-auto" size="sm">
          Accept
        </Button>
      </div>
    </div>
  );
}

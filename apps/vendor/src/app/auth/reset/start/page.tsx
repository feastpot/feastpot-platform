'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Scanner-proof password-reset interstitial for the vendor portal.
 *
 * Identical in purpose to apps/web/src/app/auth/reset/start/page.tsx.
 * The recovery email links to the customer app's interstitial (at
 * feastpot.co.uk/auth/reset/start) for all users. This vendor-side
 * route exists so vendors who request a reset from the vendor portal
 * are routed back here after the Supabase token exchange, landing on
 * the vendor-branded update form.
 *
 * Fragment pattern: the Supabase ConfirmationURL is in the URL hash.
 * URL fragments are never sent to the server, so mail scanners cannot
 * consume the single-use token. Only a human click on "Set new password"
 * redeems it.
 *
 * CRITICAL: never auto-redirect or auto-submit on load.
 */
export default function VendorResetStart() {
  type State = 'loading' | 'ready' | 'invalid';
  const [state, setState] = useState<State>('loading');
  const [confirmationUrl, setConfirmationUrl] = useState('');

  useEffect(() => {
    const hash = window.location.hash.slice(1).trim();
    if (!hash) {
      setState('invalid');
      return;
    }
    try {
      const parsed = new URL(hash);
      if (parsed.protocol !== 'https:') {
        setState('invalid');
        return;
      }
    } catch {
      setState('invalid');
      return;
    }
    setConfirmationUrl(hash);
    setState('ready');
  }, []);

  const handleProceed = () => {
    if (confirmationUrl) {
      window.location.href = confirmationUrl;
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/sign-in" aria-label="Feastpot vendor portal">
            <Image
              src="/images/feastpot-logo.png"
              alt="Feastpot"
              width={317}
              height={100}
              className="h-10 w-auto"
              priority
            />
          </Link>
        </div>

        <div className="fp-card w-full border border-border bg-white p-8">
          {state === 'loading' && (
            <div className="space-y-3 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-teal" />
              <p className="text-sm text-mid">Preparing your link&hellip;</p>
            </div>
          )}

          {state === 'invalid' && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <span className="text-2xl font-bold text-red-600" aria-hidden>
                  !
                </span>
              </div>
              <h1 className="text-xl font-extrabold tracking-tight text-dark">
                This link is not valid
              </h1>
              <p className="text-sm leading-relaxed text-mid">
                The reset link is missing or has been corrupted. This can happen if your email
                client altered the link.
              </p>
              <Link
                href="/forgot-password"
                className="inline-block rounded-lg bg-teal px-6 py-3 text-sm font-semibold text-white hover:bg-teal-dark"
              >
                Request a new link
              </Link>
            </div>
          )}

          {state === 'ready' && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-dark">
                  Set a new password
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-mid">
                  Click below to choose a new password for your Feastpot vendor account. The link
                  expires 60 minutes from when it was sent.
                </p>
              </div>
              <button
                type="button"
                onClick={handleProceed}
                className="w-full rounded-lg bg-teal py-3 text-sm font-semibold text-white hover:bg-teal-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
              >
                Set new password
              </button>
              <p className="text-center text-xs text-mid">
                Link expired?{' '}
                <Link href="/forgot-password" className="font-semibold text-teal hover:underline">
                  Request a new one
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

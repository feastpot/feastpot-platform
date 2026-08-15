'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Scanner-proof password-reset interstitial.
 *
 * The recovery email links here with the Supabase ConfirmationURL in the URL
 * fragment, for example:
 *   https://feastpot.co.uk/auth/reset/start#https://[supabase]/auth/v1/verify?...
 *
 * URL fragments are NEVER transmitted to the server, so corporate mail security
 * tools (Microsoft Defender Safe Links, Proofpoint, etc.) that perform a
 * server-side GET on the emailed link cannot see or consume the single-use token.
 *
 * CRITICAL: this page must never auto-redirect or auto-submit on load.
 * Auto-redirect would reintroduce the exact problem this pattern solves.
 * The token is only redeemed when the human explicitly clicks the button.
 *
 * After the user clicks, Supabase validates the token and redirects to the
 * redirect_to URL embedded in the ConfirmationURL, which is:
 *   /auth/callback?type=recovery&next=/auth/reset/update
 * The callback exchanges the code for a session and sends the user to the
 * update-password form.
 */
export default function ResetStart() {
  type State = 'loading' | 'ready' | 'invalid';
  const [state, setState] = useState<State>('loading');
  const [confirmationUrl, setConfirmationUrl] = useState('');

  useEffect(() => {
    // Read the fragment (everything after '#'). This runs client-side only,
    // which is why the token is safe from server-side scanners.
    const hash = window.location.hash.slice(1).trim();

    if (!hash) {
      setState('invalid');
      return;
    }

    // Basic sanity check: must be a valid https URL.
    // This is NOT a security boundary - the real validation happens server-side
    // when Supabase verifies the token. We just want to avoid navigating to
    // obviously wrong values (missing fragment, javascript: URLs, etc.).
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
      // Navigate to the Supabase verification URL. Supabase validates the
      // token and redirects to the redirect_to URL (our /auth/callback).
      window.location.href = confirmationUrl;
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Link href="/" aria-label="Feastpot home">
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

        <div className="rounded-2xl bg-white p-8 shadow-card">
          {state === 'loading' && (
            <div className="space-y-3 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cream-deep border-t-brand" />
              <p className="text-sm text-charcoal-mid">Preparing your link&hellip;</p>
            </div>
          )}

          {state === 'invalid' && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <span className="text-2xl" aria-hidden>
                  !
                </span>
              </div>
              <h1 className="font-display text-xl font-black tracking-tight text-charcoal">
                This link is not valid
              </h1>
              <p className="text-sm leading-relaxed text-charcoal-mid">
                The reset link is missing or has been corrupted. This can happen if your email
                client altered the link.
              </p>
              <Link
                href="/forgot-password"
                className="inline-block rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-dark"
              >
                Request a new link
              </Link>
            </div>
          )}

          {state === 'ready' && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">
                  Set a new password
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-mid">
                  Click below to choose a new password for your Feastpot account. The link expires
                  60 minutes from when it was sent.
                </p>
              </div>

              <button
                type="button"
                onClick={handleProceed}
                className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white shadow-card hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                Set new password
              </button>

              <p className="text-center text-xs text-charcoal-mid">
                Link expired?{' '}
                <Link href="/forgot-password" className="font-semibold text-brand hover:underline">
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

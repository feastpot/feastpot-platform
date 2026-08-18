'use client';

/**
 * Scanner-proof email confirmation interstitial.
 *
 * Auth email templates (confirmation, magic link, email change, invite) link
 * here with the Supabase token_hash and OTP type in the URL fragment:
 *   https://feastpot.co.uk/auth/confirm#token_hash=<hash>&type=signup
 *
 * URL fragments are never transmitted to the server, so corporate mail security
 * scanners (Microsoft Defender Safe Links, Proofpoint, etc.) that perform a
 * server-side GET on the emailed link cannot see or consume the single-use token.
 *
 * CRITICAL: this page must never auto-verify on load. Auto-verification would
 * let a scanner consume the token before the human sees the page. The token is
 * only redeemed when the user explicitly clicks the button.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';

type OtpType = 'signup' | 'invite' | 'magiclink' | 'email_change';
type PageState = 'loading' | 'ready' | 'verifying' | 'success' | 'invalid' | 'error';

const VALID_TYPES = new Set<string>(['signup', 'invite', 'magiclink', 'email_change']);

const COPY: Record<
  OtpType,
  { heading: string; body: string; button: string; successHeading: string; successBody: string }
> = {
  signup: {
    heading: 'Confirm your account',
    body: 'Click below to verify your email address and activate your Feastpot account.',
    button: 'Confirm my account',
    successHeading: 'Account confirmed',
    successBody: 'Your account is active. You will be redirected to the home page.',
  },
  invite: {
    heading: 'Accept your invitation',
    body: 'Click below to accept your invitation and set up your Feastpot account.',
    button: 'Accept invitation',
    successHeading: 'Invitation accepted',
    successBody: 'You are signed in. You will be redirected shortly.',
  },
  magiclink: {
    heading: 'Sign in to Feastpot',
    body: 'Click below to sign in to your Feastpot account.',
    button: 'Sign in',
    successHeading: 'Signed in',
    successBody: 'You are now signed in. You will be redirected shortly.',
  },
  email_change: {
    heading: 'Confirm your new email',
    body: 'Click below to confirm the change to your Feastpot email address.',
    button: 'Confirm email change',
    successHeading: 'Email updated',
    successBody: 'Your email address has been updated.',
  },
};

export default function AuthConfirm() {
  const router = useRouter();
  const [state, setState] = useState<PageState>('loading');
  const [tokenHash, setTokenHash] = useState('');
  const [otpType, setOtpType] = useState<OtpType>('signup');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Read the fragment client-side; it is never sent to the server.
    const hash = window.location.hash.slice(1);
    if (!hash) {
      setState('invalid');
      return;
    }
    const params = new URLSearchParams(hash);
    const hash_ = params.get('token_hash') ?? '';
    const type_ = params.get('type') ?? '';

    if (!hash_ || !VALID_TYPES.has(type_)) {
      setState('invalid');
      return;
    }

    setTokenHash(hash_);
    setOtpType(type_ as OtpType);
    setState('ready');
  }, []);

  const handleConfirm = async () => {
    if (!tokenHash) return;
    setState('verifying');

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });

    if (error) {
      setErrorMessage(
        error.message.includes('expired') || error.message.includes('invalid')
          ? 'This link has expired or has already been used. Please request a new one.'
          : 'Something went wrong. Please try again or request a new link.',
      );
      setState('error');
      return;
    }

    setState('success');

    // Small delay so the success message is visible, then redirect.
    setTimeout(() => {
      router.push(otpType === 'email_change' ? '/account' : '/');
    }, 1_500);
  };

  const copy = COPY[otpType];

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
          {/* Loading */}
          {state === 'loading' && (
            <div className="space-y-3 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cream-deep border-t-brand" />
              <p className="text-sm text-charcoal-mid">Preparing your link&hellip;</p>
            </div>
          )}

          {/* Invalid fragment */}
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
                The confirmation link is missing or has been corrupted. This can happen if your
                email client altered the link.
              </p>
              <Link
                href="/sign-in"
                className="inline-block rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-dark"
              >
                Back to sign in
              </Link>
            </div>
          )}

          {/* Token already used or expired */}
          {state === 'error' && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <span className="text-2xl" aria-hidden>
                  !
                </span>
              </div>
              <h1 className="font-display text-xl font-black tracking-tight text-charcoal">
                Link expired or already used
              </h1>
              <p className="text-sm leading-relaxed text-charcoal-mid">{errorMessage}</p>
              <Link
                href="/sign-in"
                className="inline-block rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-dark"
              >
                Back to sign in
              </Link>
            </div>
          )}

          {/* Ready to confirm */}
          {state === 'ready' && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">
                  {copy.heading}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-mid">{copy.body}</p>
              </div>
              <button
                type="button"
                onClick={handleConfirm}
                className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white shadow-card hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                {copy.button}
              </button>
              <p className="text-center text-xs text-charcoal-mid">
                Wrong link?{' '}
                <Link href="/sign-in" className="font-semibold text-brand hover:underline">
                  Back to sign in
                </Link>
              </p>
            </div>
          )}

          {/* Verifying */}
          {state === 'verifying' && (
            <div className="space-y-3 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cream-deep border-t-brand" />
              <p className="text-sm text-charcoal-mid">Verifying&hellip;</p>
            </div>
          )}

          {/* Success */}
          {state === 'success' && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                <svg
                  className="h-6 w-6 text-brand"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="font-display text-xl font-black tracking-tight text-charcoal">
                {copy.successHeading}
              </h1>
              <p className="text-sm leading-relaxed text-charcoal-mid">{copy.successBody}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

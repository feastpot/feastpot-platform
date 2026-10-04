'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { safeRedirect } from '@/lib/safe-redirect';

type OtpType = 'invite' | 'recovery';
type PageState = 'loading' | 'ready' | 'verifying' | 'invalid' | 'error';

const VALID_TYPES = new Set<string>(['invite', 'recovery']);

export default function VendorAuthConfirm() {
  const router = useRouter();
  const [state, setState] = useState<PageState>('loading');
  const [tokenHash, setTokenHash] = useState('');
  const [otpType, setOtpType] = useState<OtpType>('invite');
  const [next, setNext] = useState('/orders');
  const readFragment = useRef(false);

  useEffect(() => {
    if (readFragment.current) return;
    readFragment.current = true;
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.hash.slice(1));
    const receivedTokenHash = params.get('token_hash') ?? '';
    const receivedType = params.get('type') ?? '';
    setNext(safeRedirect(url.searchParams.get('next'), '/orders'));

    // Remove the one-time credential from the address bar before any auth
    // request, while keeping it only in component memory until human action.
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);

    if (!receivedTokenHash || !VALID_TYPES.has(receivedType)) {
      setState('invalid');
      return;
    }
    setTokenHash(receivedTokenHash);
    setOtpType(receivedType as OtpType);
    setState('ready');
  }, []);

  const handleContinue = async () => {
    if (!tokenHash || state !== 'ready') return;
    setState('verifying');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      if (error) {
        setState('error');
        return;
      }
      router.replace(`/auth/reset/update?next=${encodeURIComponent(next)}`);
    } catch {
      setState('error');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link
            href="/sign-in"
            aria-label="Feastpot vendor portal"
            data-testid="link-feastpot-vendor-portal"
          >
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

        <div className="fp-card border border-border bg-white p-8">
          {state === 'loading' && (
            <p className="text-sm text-mid">Preparing your secure setup link&hellip;</p>
          )}

          {state === 'ready' && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-dark">
                  Set up your vendor account
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-mid">
                  Confirm your secure link, then choose a password to access your vendor account.
                </p>
              </div>
              <button
                type="button"
                onClick={handleContinue}
                data-testid="button-continue-account-setup"
                className="w-full rounded-lg bg-teal py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
              >
                Continue securely
              </button>
            </div>
          )}

          {state === 'verifying' && (
            <div className="space-y-3 text-center" role="status">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-teal" />
              <p className="text-sm text-mid">Verifying your account&hellip;</p>
            </div>
          )}

          {(state === 'invalid' || state === 'error') && (
            <div className="space-y-4">
              <h1 className="text-xl font-extrabold tracking-tight text-dark">
                This setup link cannot be used
              </h1>
              <p className="text-sm leading-relaxed text-mid" role="alert">
                The link may be expired, incomplete, or already used. Return to sign in and request
                a new setup link.
              </p>
              <Link
                href="/sign-in"
                data-testid="link-back-to-sign-in"
                className="inline-block rounded-lg bg-teal px-6 py-3 text-sm font-semibold text-white hover:bg-teal-dark"
              >
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

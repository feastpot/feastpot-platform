'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';

type OtpType = 'invite' | 'recovery';
type PageState = 'loading' | 'ready' | 'verifying' | 'invalid' | 'error';

const VALID_TYPES = new Set<string>(['invite', 'recovery']);

export default function VendorAuthConfirm() {
  const router = useRouter();
  const [state, setState] = useState<PageState>('loading');
  const [tokenHash, setTokenHash] = useState('');
  const [otpType, setOtpType] = useState<OtpType>('invite');

  useEffect(() => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.hash.slice(1));
    const receivedTokenHash = params.get('token_hash') ?? '';
    const receivedType = params.get('type') ?? '';

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
      router.replace('/auth/reset/update');
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
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
            Private demo account
          </p>

          {state === 'loading' && (
            <p className="text-sm text-mid">Preparing your secure setup link&hellip;</p>
          )}

          {state === 'ready' && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-dark">
                  {otpType === 'invite' ? 'Accept demo invitation' : 'Continue account recovery'}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-mid">
                  Continue to securely confirm your demo vendor access, then choose a password.
                  Lagos Table is a fictional demonstration and cannot accept orders or receive
                  payouts.
                </p>
              </div>
              <button
                type="button"
                onClick={handleContinue}
                data-testid="button-continue-demo-setup"
                className="w-full rounded-lg bg-teal py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"
              >
                Continue securely
              </button>
            </div>
          )}

          {state === 'verifying' && (
            <div className="space-y-3 text-center" role="status">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-teal" />
              <p className="text-sm text-mid">Verifying your demo access&hellip;</p>
            </div>
          )}

          {(state === 'invalid' || state === 'error') && (
            <div className="space-y-4">
              <h1 className="text-xl font-extrabold tracking-tight text-dark">
                This setup link cannot be used
              </h1>
              <p className="text-sm leading-relaxed text-mid" role="alert">
                The link may be expired, incomplete, or already used. Return to sign in and request
                help with your demo access.
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

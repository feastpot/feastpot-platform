'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

const REFERRAL_KEY = 'feastpot.referral.v1';

/**
 * Friend-share landing page (FR-REF-001).
 *
 * Captures `?ref=CODE` from a shared URL, persists it to localStorage so it
 * survives the round-trip through Supabase email confirmation, then bounces
 * to the register page. The register form pre-populates from the same key.
 *
 * Next 15 requires `useSearchParams()` to live inside a `<Suspense>` boundary
 * so the static prerender for `/join` can bail out cleanly to client render
 * — without it, `next build` fails with a CSR-bailout error.
 */
function JoinRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const code = params.get('ref');
    if (code && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(REFERRAL_KEY, code);
      } catch {
        /* private mode — silently ignore, sign-up still works without the bonus */
      }
    }
    router.replace('/register');
  }, [params, router]);

  return null;
}

export default function JoinPage() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 py-16">
      <p className="text-sm text-mid">Redirecting to sign up…</p>
      <Suspense fallback={null}>
        <JoinRedirect />
      </Suspense>
    </div>
  );
}

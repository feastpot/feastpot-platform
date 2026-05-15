'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { API_URL } from '@/lib/env';

const REFERRAL_KEY = 'feastpot.referral.v1';

type State =
  | { kind: 'loading' }
  | { kind: 'valid'; referrerFirstName: string; bonusPence: number }
  | { kind: 'invalid' };

/**
 * Friend-share landing page (FR-REF-001 + D-106 fix).
 *
 * Captures `?ref=CODE` from a shared URL, **validates it against the API**
 * before persisting, then bounces to the register page. Validating up-front
 * prevents typo-spam codes (D-106) from being saved and silently failing
 * later in the signup flow.
 *
 * The localStorage key (`feastpot.referral.v1`) MUST stay in sync with the
 * register page — it pre-populates the referral input from the same key.
 *
 * Next 15 requires `useSearchParams()` to live inside a `<Suspense>` boundary
 * so the static prerender for `/join` can bail out cleanly to client render.
 */
function JoinFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get('ref');
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!code) {
      router.replace('/register');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/v1/referrals/validate?code=${encodeURIComponent(code)}`,
          { cache: 'no-store' },
        );
        const body = (await res.json().catch(() => null)) as
          | { valid?: boolean; referrerFirstName?: string; bonusPence?: number }
          | null;
        if (cancelled) return;
        if (res.ok && body?.valid) {
          // Persist as upper-case so the register-form pre-fill matches the
          // server's case-insensitive lookup deterministically.
          try {
            window.localStorage.setItem(REFERRAL_KEY, code.toUpperCase());
          } catch {
            /* private-mode — best effort, signup still works without bonus */
          }
          setState({
            kind: 'valid',
            referrerFirstName: body.referrerFirstName ?? 'a Feastpot member',
            bonusPence: body.bonusPence ?? 500,
          });
          // Brief celebration window then forward — long enough to register
          // the bonus copy, short enough not to feel stalled.
          setTimeout(() => {
            if (!cancelled) router.replace('/register');
          }, 2000);
        } else {
          // Defensive: don't leave a stale key from a prior valid visit.
          try {
            window.localStorage.removeItem(REFERRAL_KEY);
          } catch {
            /* ignore */
          }
          setState({ kind: 'invalid' });
        }
      } catch {
        if (!cancelled) setState({ kind: 'invalid' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, router]);

  if (state.kind === 'loading') {
    return <p className="text-sm text-mid">Checking your referral code…</p>;
  }

  if (state.kind === 'valid') {
    const pounds = (state.bonusPence / 100).toFixed(0);
    return (
      <div className="text-center">
        <span className="mb-3 block text-4xl" aria-hidden>
          🎉
        </span>
        <h2 className="text-lg font-semibold text-dark">
          {state.referrerFirstName} invited you to Feastpot
        </h2>
        <p className="mt-1 text-sm text-mid">
          You’ll get £{pounds} off your first order. Taking you to sign up…
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <span className="mb-3 block text-4xl" aria-hidden>
        🤔
      </span>
      <h2 className="text-lg font-semibold text-dark">That referral code wasn’t found</h2>
      <p className="mt-1 text-sm text-mid">
        It may have expired. You can still create a free account.
      </p>
      <Link
        href="/register"
        className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        Create account anyway
      </Link>
    </div>
  );
}

export default function JoinPage() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 py-16">
      <Suspense fallback={<p className="text-sm text-mid">Loading…</p>}>
        <JoinFlow />
      </Suspense>
    </div>
  );
}

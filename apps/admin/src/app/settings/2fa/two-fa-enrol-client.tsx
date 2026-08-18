'use client';

import { Button, Input } from '@feastpot/ui';
import { AlertTriangle, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { SecuritySection } from '@/app/settings/security-section';
import { useToast } from '@/components/ui/toaster';
import type { StaffUser } from '@/lib/auth/server-gate';
import { createClient } from '@/lib/supabase/client';

/**
 * Client wrapper for the dedicated 2FA page shown when ADMIN_REQUIRE_AAL2 is
 * on and the user's session is aal1.
 *
 * Two distinct states:
 *
 * 1. No verified TOTP factor yet -- show SecuritySection (full enrolment flow).
 *    After successful enrolment the session is aal2 and the user is redirected
 *    to their original destination.
 *
 * 2. A verified TOTP factor exists but the session is aal1 (fresh sign-in, or
 *    factor removed and re-enrolled). Show a compact challenge form:
 *    mfa.challenge() + mfa.verify() upgrades the JWT to aal2 so the redirect
 *    works without a full page reload.
 */

interface FactorRow {
  id: string;
  status: 'unverified' | 'verified';
  factor_type: string;
}

type PageState = 'loading' | 'no_factor' | 'challenge' | 'done';

export function TwoFaEnrolClient({ next, user: _user }: { next: string; user: StaffUser }) {
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [factor, setFactor] = useState<FactorRow | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        // If we cannot list factors, fall through to the enrolment UI so the
        // user can at least set one up rather than hitting a dead end.
        setPageState('no_factor');
        return;
      }
      const active = (data?.totp ?? []).find((f) => f.status === 'verified') as
        | FactorRow
        | undefined;
      if (active) {
        setFactor(active);
        setPageState('challenge');
      } else {
        setPageState('no_factor');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleChallenge() {
    if (!factor) return;
    setVerifying(true);

    const challengeResult = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challengeResult.error || !challengeResult.data) {
      setVerifying(false);
      toast({
        title: 'Challenge failed',
        description: challengeResult.error?.message ?? 'Please try again.',
        variant: 'destructive',
      });
      return;
    }

    const verifyResult = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challengeResult.data.id,
      code: code.trim(),
    });
    setVerifying(false);

    if (verifyResult.error) {
      toast({
        title: 'Wrong code',
        description: 'Try again with a fresh 6-digit code from your authenticator.',
        variant: 'destructive',
      });
      setCode('');
      return;
    }

    // Session is now aal2 -- navigate to original destination.
    setPageState('done');
    router.push(next);
  }

  function handleEnrolled() {
    // Called by SecuritySection after a brand-new TOTP factor has been
    // verified. The session is now aal2.
    setPageState('done');
    router.push(next);
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-background p-6 pt-16">
      <div className="w-full max-w-lg space-y-6">
        {/* Context banner explaining why the user is here */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {pageState === 'challenge'
                ? '2FA verification required'
                : '2FA setup required before you continue'}
            </p>
            <p className="mt-1 text-sm text-amber-900/80">
              {pageState === 'challenge'
                ? 'Enter the 6-digit code from your authenticator app to verify your identity and continue.'
                : 'All admin console accounts must have two-factor authentication enabled. Set up your authenticator app below and verify a code to unlock access.'}
            </p>
          </div>
        </div>

        {pageState === 'loading' && (
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}

        {pageState === 'no_factor' && <SecuritySection onEnrolled={handleEnrolled} />}

        {pageState === 'challenge' && (
          <ChallengeCard
            code={code}
            onCodeChange={setCode}
            verifying={verifying}
            onVerify={handleChallenge}
          />
        )}

        {pageState === 'done' && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-900">
            Verified. Redirecting…
          </div>
        )}
      </div>
    </main>
  );
}

function ChallengeCard({
  code,
  onCodeChange,
  verifying,
  onVerify,
}: {
  code: string;
  onCodeChange: (v: string) => void;
  verifying: boolean;
  onVerify: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">Enter your 2FA code</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Open your authenticator app (Google Authenticator, 1Password, Authy, etc.) and enter the
        current 6-digit code for your Feastpot admin account.
      </p>

      <div>
        <label htmlFor="totp-challenge-code" className="text-sm font-semibold">
          6-digit code
        </label>
        <Input
          id="totp-challenge-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          className="mt-2 h-12 w-44 text-center text-xl font-bold tracking-[0.4em]"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && code.length === 6 && !verifying) onVerify();
          }}
        />
      </div>

      <Button
        onClick={onVerify}
        disabled={verifying || code.length !== 6}
        className="bg-emerald-700 text-white hover:bg-emerald-800"
      >
        <ShieldCheck className="mr-1.5 h-4 w-4" />
        {verifying ? 'Verifying…' : 'Verify and continue'}
      </Button>

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Lost access to your authenticator? Use one of your recovery codes, or ask an admin to remove
        your factor via the Supabase Dashboard (see{' '}
        <code className="mx-0.5 font-mono">docs/2fa-recovery.md</code>).
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Want to remove and re-enrol your authenticator? Go to{' '}
        <a href="/settings" className="underline underline-offset-2">
          Account Settings
        </a>{' '}
        after verifying.
      </div>
    </div>
  );
}

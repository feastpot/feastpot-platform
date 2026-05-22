'use client';

import { cn } from '@feastpot/ui';
import {
  AlertTriangle,
  Copy,
  Download,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { useToast } from '@/components/ui/toaster';
import {
  useRecoveryCodeStatus,
  useRegenerateRecoveryCodes,
} from '@/hooks/use-mfa-recovery-codes';
import { createClient } from '@/lib/supabase/client';

/**
 * 2FA enrolment + recovery codes — Supabase MFA (TOTP) with a
 * self-serve recovery-codes layer on top via the Feastpot API.
 *
 * Visual shell migrated to the SideNav redesign: fp-card surfaces,
 * tone tokens (text-dark/mid, bg-surface, bg-teal/vendor/brand
 * families), and rounded inputs / vendor-green primary buttons that
 * match Team, Profile and the other settings screens.
 */

interface FactorRow {
  id: string;
  status: 'unverified' | 'verified';
  friendly_name?: string | null;
  factor_type: string;
}

export function SecurityClient() {
  const supabase = createClient();
  const { toast } = useToast();

  const [factors, setFactors] = useState<FactorRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [pending, setPending] = useState<{
    factorId: string;
    qr: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [showCodes, setShowCodes] = useState<string[] | null>(null);

  const activeFactor = factors?.find((f) => f.status === 'verified') ?? null;
  const statusQ = useRecoveryCodeStatus(!!activeFactor);
  const regenerate = useRegenerateRecoveryCodes();

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast({
        title: 'Could not load 2FA state',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setFactors((data?.totp ?? []) as FactorRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnrol() {
    setEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Vendor portal ${new Date().toLocaleDateString('en-GB')}`,
    });
    setEnrolling(false);
    if (error || !data) {
      toast({
        title: 'Could not start enrolment',
        description: error?.message ?? '',
        variant: 'destructive',
      });
      return;
    }
    setPending({
      factorId: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
    });
  }

  async function verifyAndActivate() {
    if (!pending) return;
    setVerifying(true);
    const challenge = await supabase.auth.mfa.challenge({ factorId: pending.factorId });
    if (challenge.error || !challenge.data) {
      setVerifying(false);
      toast({
        title: 'Challenge failed',
        description: challenge.error?.message ?? '',
        variant: 'destructive',
      });
      return;
    }
    const verify = await supabase.auth.mfa.verify({
      factorId: pending.factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    setVerifying(false);
    if (verify.error) {
      toast({
        title: 'Wrong code',
        description: 'Try again with a fresh 6-digit code.',
        variant: 'destructive',
      });
      return;
    }
    toast({ title: '2FA enabled' });
    setPending(null);
    setCode('');
    await refresh();

    try {
      const result = await regenerate.mutateAsync();
      setShowCodes(result.codes);
    } catch (e) {
      toast({
        title: 'Recovery codes not generated',
        description:
          e instanceof Error
            ? e.message
            : 'You can generate them manually from this page.',
        variant: 'destructive',
      });
    }
  }

  async function unenrol(factorId: string) {
    if (
      !confirm(
        'Remove 2FA from this account? Your recovery codes will also be invalidated. You can re-enrol any time.',
      )
    )
      return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      toast({
        title: 'Could not remove 2FA',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: '2FA removed' });
    await refresh();
  }

  async function regenerateNow() {
    if (
      !confirm(
        'Generate a new set of recovery codes? Any unused codes from before will stop working immediately.',
      )
    )
      return;
    try {
      const result = await regenerate.mutateAsync();
      setShowCodes(result.codes);
      toast({ title: 'New recovery codes generated' });
    } catch (e) {
      toast({
        title: 'Could not generate codes',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      });
    }
  }

  const remaining = statusQ.data?.remaining ?? 0;
  const total = statusQ.data?.total ?? 10;
  const lowCodes = activeFactor && remaining <= 3 && total > 0;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-dark">Security</h1>
        <p className="mt-1 text-sm text-mid">
          Add two-factor authentication to protect your vendor account. We support time-based
          one-time passwords (TOTP) via Google Authenticator, 1Password, Authy and similar apps.
        </p>
      </header>

      {loading && (
        <div className="fp-card border border-border bg-white p-5 text-sm text-mid">
          Loading 2FA state…
        </div>
      )}

      {!loading && activeFactor && (
        <>
          <section className="fp-card border border-border bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-light text-teal-dark"
                >
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-bold text-dark">2FA is active</p>
                  <p className="text-xs text-mid">
                    You will be challenged for a 6-digit code on every sign-in.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => unenrol(activeFactor.id)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                <ShieldOff className="h-4 w-4" aria-hidden />
                Remove
              </button>
            </div>
          </section>

          <section className="fp-card border border-border bg-white p-5">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-light text-teal-dark"
              >
                <KeyRound className="h-4 w-4" />
              </span>
              <h2 className="text-base font-bold text-dark">Recovery codes</h2>
            </div>
            <p className="mt-3 text-sm text-mid">
              If you lose your authenticator device, a recovery code lets you sign in and remove
              2FA. Each code can only be used once.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-sm text-dark">
                <span className="font-bold tabular-nums">
                  {statusQ.data?.remaining ?? '–'} of {statusQ.data?.total ?? 10}
                </span>{' '}
                <span className="text-mid">codes remaining</span>
              </span>
              <button
                type="button"
                onClick={regenerateNow}
                disabled={regenerate.isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-dark transition-colors hover:bg-surface disabled:opacity-60"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                {regenerate.isPending ? 'Generating…' : 'Generate new codes'}
              </button>
            </div>
            {lowCodes && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                You are running low on recovery codes. Generate a new set so you do not get locked
                out.
              </div>
            )}
          </section>
        </>
      )}

      {!loading && !activeFactor && !pending && (
        <section className="fp-card border border-border bg-white p-5">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700"
            >
              <ShieldOff className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-bold text-dark">2FA is off</p>
              <p className="mt-1 text-sm text-mid">
                Anyone with your email and password can sign in. Add 2FA so a lost password is not
                enough on its own.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={startEnrol}
              disabled={enrolling}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-teal px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-60"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
              {enrolling ? 'Preparing…' : 'Enable 2FA'}
            </button>
          </div>
        </section>
      )}

      {pending && (
        <section className="fp-card border border-border bg-white p-5">
          <div className="space-y-5">
            <div>
              <p className="text-sm font-bold text-dark">Step 1. Scan the QR with your authenticator</p>
              <p className="mt-1 text-xs text-mid">
                Or paste this secret if you cannot scan:{' '}
                <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-dark">
                  {pending.secret}
                </code>
              </p>
            </div>

            {/* Supabase returns the QR as a data: URL so a plain img tag is safe. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pending.qr}
              alt="2FA QR code"
              className="h-48 w-48 rounded-lg border border-border bg-white p-2"
            />

            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              After you verify the code below, we will show you 10 single-use recovery codes. Save
              them somewhere safe (a password manager works well). If you lose your authenticator
              app, a recovery code is the only way to get back in without contacting support.
            </div>

            <div>
              <label htmlFor="totp-code" className="block text-sm font-bold text-dark">
                Step 2. Enter the current 6-digit code
              </label>
              <input
                id="totp-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="mt-2 h-11 w-44 rounded-lg border border-border bg-white px-3 text-center text-lg font-bold tracking-[0.4em] text-dark placeholder:text-mid focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
                placeholder="000000"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={verifyAndActivate}
                disabled={verifying || code.length !== 6}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-teal px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
                {verifying ? 'Verifying…' : 'Verify and enable'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setCode('');
                }}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-white px-4 text-sm font-semibold text-dark transition-colors hover:bg-surface"
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      )}

      {showCodes && <RecoveryCodesModal codes={showCodes} onClose={() => setShowCodes(null)} />}
    </div>
  );
}

/**
 * One-time recovery-code reveal. Includes copy and download .txt helpers
 * because users are bad at writing 10 codes down by hand. Closing the
 * modal clears the codes from memory.
 */
function RecoveryCodesModal({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const { toast } = useToast();
  const [acknowledged, setAcknowledged] = useState(false);

  const asText =
    `Feastpot vendor 2FA recovery codes\nGenerated: ${new Date().toISOString()}\n\n` +
    codes.map((c, i) => `${String(i + 1).padStart(2, ' ')}. ${c}`).join('\n') +
    '\n\nEach code works once. Keep them somewhere safe.\n';

  function copyAll() {
    navigator.clipboard
      .writeText(codes.join('\n'))
      .then(() => toast({ title: 'Copied to clipboard' }))
      .catch(() =>
        toast({
          title: 'Could not copy',
          description: 'Please copy the codes manually.',
          variant: 'destructive',
        }),
      );
  }

  function download() {
    const blob = new Blob([asText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'feastpot-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-codes-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="fp-card w-full max-w-md border border-border bg-white p-6 shadow-xl">
        <h2 id="recovery-codes-title" className="text-lg font-bold text-dark">
          Your recovery codes
        </h2>
        <p className="mt-1 text-sm text-mid">
          Save these somewhere safe. We will not show them again. Each code works exactly once.
        </p>

        <ul className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface p-3 font-mono text-sm tracking-wider text-dark">
          {codes.map((c) => (
            <li key={c} className="select-all">
              {c}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyAll}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-dark transition-colors hover:bg-surface"
          >
            <Copy className="h-4 w-4" aria-hidden />
            Copy all
          </button>
          <button
            type="button"
            onClick={download}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-dark transition-colors hover:bg-surface"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download .txt
          </button>
        </div>

        <label className="mt-5 flex items-start gap-2 text-sm text-dark">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className={cn(
              'mt-0.5 h-4 w-4 rounded border-border text-teal',
              'focus:ring-2 focus:ring-teal/30',
            )}
          />
          <span>I have saved these codes somewhere safe.</span>
        </label>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={!acknowledged}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-teal px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-60"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

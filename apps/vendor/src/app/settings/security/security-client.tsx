'use client';

import { Button, Card, CardContent } from '@feastpot/ui';
import { Copy, Download, KeyRound, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useToast } from '@/components/ui/toaster';
import {
  useRecoveryCodeStatus,
  useRegenerateRecoveryCodes,
} from '@/hooks/use-mfa-recovery-codes';
import { createClient } from '@/lib/supabase/client';

/**
 * 2FA enrolment + recovery codes (T011 + A/B follow-up).
 *
 * Backed by Supabase MFA (TOTP). Supabase JS handles the actual TOTP
 * secret + challenge plumbing; we layer self-serve recovery codes on top
 * (Supabase MFA does not ship them) via the Feastpot API.
 *
 * Flows:
 *   1. show current factor state + remaining-codes count
 *   2. enrol -> QR + secret -> verify code -> activate -> auto-generate
 *      10 recovery codes shown ONCE
 *   3. unenrol existing factor (warns that recovery codes also reset)
 *   4. regenerate recovery codes (warns that any prior unused codes
 *      become invalid immediately)
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
  // Plaintext recovery codes are held in component state only while the
  // user is actively viewing them. Closing the modal clears the array
  // and there is no way to retrieve them again - by design.
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

    // Auto-generate the first batch of recovery codes. The user has
    // just completed a TOTP challenge so this session is aal2 and the
    // API will accept the regenerate call.
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground">
          Add two-factor authentication to protect your vendor account. We support time-based
          one-time passwords (TOTP) via Google Authenticator, 1Password, Authy and similar apps.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading 2FA state…</p>}

      {!loading && activeFactor && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-teal" />
              <div>
                <p className="font-semibold">2FA is active</p>
                <p className="text-xs text-muted-foreground">
                  You will be challenged for a 6-digit code on every sign-in.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => unenrol(activeFactor.id)}
            >
              <ShieldOff className="mr-1 h-4 w-4" />
              Remove
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && activeFactor && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-vendor" />
              <p className="font-semibold">Recovery codes</p>
            </div>
            <p className="text-sm text-muted-foreground">
              If you lose your authenticator device, a recovery code lets you sign in and remove
              2FA. Each code can only be used once.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">
                <span className="font-semibold">
                  {statusQ.data?.remaining ?? '–'} of {statusQ.data?.total ?? 10}
                </span>{' '}
                codes remaining
              </span>
              <Button
                variant="outline"
                onClick={regenerateNow}
                disabled={regenerate.isPending}
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                {regenerate.isPending ? 'Generating…' : 'Generate new codes'}
              </Button>
            </div>
            {(statusQ.data?.remaining ?? 0) <= 3 && (statusQ.data?.total ?? 0) > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                You are running low on recovery codes. Generate a new set so you do not get locked
                out.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && !activeFactor && !pending && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="font-semibold">2FA is off</p>
            <p className="text-sm text-muted-foreground">
              Anyone with your email and password can sign in. Add 2FA so a lost password is not
              enough on its own.
            </p>
            <Button
              onClick={startEnrol}
              disabled={enrolling}
              className="bg-vendor hover:bg-vendor-dark"
            >
              {enrolling ? 'Preparing…' : 'Enable 2FA'}
            </Button>
          </CardContent>
        </Card>
      )}

      {pending && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <p className="font-semibold">Step 1. Scan the QR with your authenticator</p>
              <p className="text-xs text-muted-foreground">
                Or paste the secret if you cannot scan:{' '}
                <code className="rounded bg-muted px-1 text-xs">{pending.secret}</code>
              </p>
            </div>
            {/* Supabase returns the QR as a data: URL so a plain img tag is safe. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pending.qr}
              alt="2FA QR code"
              className="h-48 w-48 rounded-md border bg-white p-2"
            />

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              After you verify the code below, we will show you 10 single-use recovery codes. Save
              them somewhere safe (a password manager works well). If you lose your authenticator
              app, a recovery code is the only way to get back in without contacting support.
            </div>

            <div>
              <label htmlFor="totp-code" className="block text-sm font-semibold">
                Step 2. Enter the current 6-digit code
              </label>
              <input
                id="totp-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="mt-1 h-10 w-40 rounded-md border border-input bg-background px-3 text-center text-lg tracking-widest"
                placeholder="000000"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={verifyAndActivate}
                disabled={verifying || code.length !== 6}
                className="bg-vendor hover:bg-vendor-dark"
              >
                {verifying ? 'Verifying…' : 'Verify and enable'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPending(null);
                  setCode('');
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
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
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
        <h2 id="recovery-codes-title" className="text-lg font-semibold">
          Your recovery codes
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Save these somewhere safe. We will not show them again. Each code works exactly once.
        </p>

        <ul className="mt-4 grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3 font-mono text-sm tracking-wider">
          {codes.map((c) => (
            <li key={c} className="select-all">
              {c}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={copyAll}>
            <Copy className="mr-1 h-4 w-4" />
            Copy all
          </Button>
          <Button variant="outline" onClick={download}>
            <Download className="mr-1 h-4 w-4" />
            Download .txt
          </Button>
        </div>

        <label className="mt-5 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5"
          />
          <span>I have saved these codes somewhere safe.</span>
        </label>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={onClose}
            disabled={!acknowledged}
            className="bg-vendor hover:bg-vendor-dark"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

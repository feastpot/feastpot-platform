'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@feastpot/ui';
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
 * Admin Security card: enrol / remove TOTP 2FA via Supabase MFA, plus
 * a self-serve recovery-codes layer backed by the Feastpot API.
 *
 * Mirrors the vendor portal flow in
 * `apps/vendor/src/app/settings/security/security-client.tsx` but
 * re-skinned with the admin shadcn Card primitives so it slots in
 * alongside the other settings sections.
 */

interface FactorRow {
  id: string;
  status: 'unverified' | 'verified';
  friendly_name?: string | null;
  factor_type: string;
}

export function SecuritySection() {
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
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnrol() {
    setEnrolling(true);
    // If the user previously started enrolment and abandoned it,
    // Supabase keeps the unverified factor around and will reject a
    // new enroll() with "Maximum factors reached". Sweep any unverified
    // factors first so admins can always re-start cleanly.
    const stale = (factors ?? []).filter((f) => f.status === 'unverified');
    for (const f of stale) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Admin console ${new Date().toLocaleDateString('en-GB')}`,
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
            : 'You can generate them manually from this card.',
        variant: 'destructive',
      });
    }
  }

  async function cancelEnrol() {
    if (pending) {
      // Drop the orphaned unverified factor so the next attempt starts
      // from a clean slate.
      await supabase.auth.mfa.unenroll({ factorId: pending.factorId }).catch(() => undefined);
    }
    setPending(null);
    setCode('');
    await refresh();
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
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Security &amp; 2FA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Two-factor authentication adds a one-time code (TOTP) on top of your
            password. Use Google Authenticator, 1Password, Authy or any compatible
            app.
          </p>

          {loading ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Loading 2FA state…
            </div>
          ) : activeFactor ? (
            <ActiveState
              remaining={statusQ.data?.remaining ?? null}
              total={statusQ.data?.total ?? 10}
              lowCodes={!!lowCodes}
              regenerating={regenerate.isPending}
              onRegenerate={regenerateNow}
              onRemove={() => unenrol(activeFactor.id)}
            />
          ) : pending ? (
            <PendingState
              qr={pending.qr}
              secret={pending.secret}
              code={code}
              onCodeChange={setCode}
              verifying={verifying}
              onVerify={verifyAndActivate}
              onCancel={cancelEnrol}
            />
          ) : (
            <OffState enrolling={enrolling} onEnable={startEnrol} />
          )}
        </CardContent>
      </Card>

      {showCodes ? (
        <RecoveryCodesModal codes={showCodes} onClose={() => setShowCodes(null)} />
      ) : null}
    </>
  );
}

function OffState({ enrolling, onEnable }: { enrolling: boolean; onEnable: () => void }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
          <ShieldOff className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">2FA is off</p>
          <p className="mt-1 text-sm text-amber-900/80">
            Anyone with your email and password can sign in. Enable 2FA so a stolen
            password is not enough on its own.
          </p>
          <div className="mt-3">
            <Button
              onClick={onEnable}
              disabled={enrolling}
              className="bg-emerald-700 text-white hover:bg-emerald-800"
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              {enrolling ? 'Preparing…' : 'Enable 2FA'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActiveState({
  remaining,
  total,
  lowCodes,
  regenerating,
  onRegenerate,
  onRemove,
}: {
  remaining: number | null;
  total: number;
  lowCodes: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-emerald-900">2FA is active</p>
            <p className="text-xs text-emerald-900/80">
              You will be challenged for a 6-digit code on every sign-in.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={onRemove}
          className="border-red-200 text-red-700 hover:bg-red-50"
        >
          <ShieldOff className="mr-1.5 h-4 w-4" />
          Remove 2FA
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Recovery codes</h3>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          If you lose your authenticator, a recovery code lets you sign in and
          remove 2FA. Each code works exactly once.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm">
            <span className="font-semibold tabular-nums">
              {remaining ?? '–'} of {total}
            </span>{' '}
            <span className="text-muted-foreground">codes remaining</span>
          </span>
          <Button variant="outline" onClick={onRegenerate} disabled={regenerating}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            {regenerating ? 'Generating…' : 'Generate new codes'}
          </Button>
        </div>
        {lowCodes ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            You are running low on recovery codes. Generate a new set so you do
            not get locked out.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PendingState({
  qr,
  secret,
  code,
  onCodeChange,
  verifying,
  onVerify,
  onCancel,
}: {
  qr: string;
  secret: string;
  code: string;
  onCodeChange: (v: string) => void;
  verifying: boolean;
  onVerify: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-4">
      <div>
        <p className="text-sm font-semibold">Step 1. Scan the QR with your authenticator</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Or paste this secret if you cannot scan:{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{secret}</code>
        </p>
      </div>

      {/* Supabase returns the QR as a data: URL, so a plain img tag is safe. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qr}
        alt="2FA QR code"
        className="h-48 w-48 rounded-md border border-border bg-white p-2"
      />

      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        After you verify the code below, we will show you 10 single-use recovery
        codes. Save them somewhere safe — they are the only way back in without
        contacting engineering.
      </div>

      <div>
        <label htmlFor="totp-code" className="text-sm font-semibold">
          Step 2. Enter the current 6-digit code
        </label>
        <Input
          id="totp-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          className="mt-2 h-11 w-44 text-center text-lg font-bold tracking-[0.4em]"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={onVerify}
          disabled={verifying || code.length !== 6}
          className="bg-emerald-700 text-white hover:bg-emerald-800"
        >
          <ShieldCheck className="mr-1.5 h-4 w-4" />
          {verifying ? 'Verifying…' : 'Verify and enable'}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * One-time recovery-code reveal. Includes copy + .txt download because
 * users are bad at writing 10 codes down by hand. Closing the modal
 * clears the codes from memory.
 */
function RecoveryCodesModal({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const { toast } = useToast();
  const [acknowledged, setAcknowledged] = useState(false);

  const asText =
    `FeastPot admin 2FA recovery codes\nGenerated: ${new Date().toISOString()}\n\n` +
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
    a.download = 'feastpot-admin-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-recovery-codes-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <h2 id="admin-recovery-codes-title" className="text-lg font-semibold">
          Your recovery codes
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Save these somewhere safe. We will not show them again. Each code works
          exactly once.
        </p>

        <ul className="mt-4 grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/40 p-3 font-mono text-sm tracking-wider">
          {codes.map((c) => (
            <li key={c} className="select-all">
              {c}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={copyAll}>
            <Copy className="mr-1.5 h-4 w-4" />
            Copy all
          </Button>
          <Button variant="outline" onClick={download}>
            <Download className="mr-1.5 h-4 w-4" />
            Download .txt
          </Button>
        </div>

        <label className="mt-5 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          <span>I have saved these codes somewhere safe.</span>
        </label>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={onClose}
            disabled={!acknowledged}
            className="bg-emerald-700 text-white hover:bg-emerald-800"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

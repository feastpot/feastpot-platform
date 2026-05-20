'use client';

import { Button, Card, CardContent } from '@feastpot/ui';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useToast } from '@/components/ui/toaster';
import { createClient } from '@/lib/supabase/client';

/**
 * T011: 2FA enrolment + management screen.
 *
 * Backed by Supabase MFA (TOTP). The Supabase JS client handles the
 * actual TOTP secret + challenge plumbing; we host the UX:
 *   1. show current factor state
 *   2. enrol  -> render QR + secret -> verify code -> activate
 *   3. unenrol existing factor
 *
 * Recovery codes are intentionally out of scope for this iteration:
 * Supabase MFA does not natively issue or validate them, so any UI we
 * render would be a false promise. If a vendor loses their authenticator
 * they recover via support (admin removes the factor after verifying
 * identity) which matches the rest of the platform.
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

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast({ title: 'Could not load 2FA state', description: error.message, variant: 'destructive' });
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
      toast({ title: 'Could not start enrolment', description: error?.message ?? '', variant: 'destructive' });
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
      toast({ title: 'Challenge failed', description: challenge.error?.message ?? '', variant: 'destructive' });
      return;
    }
    const verify = await supabase.auth.mfa.verify({
      factorId: pending.factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    setVerifying(false);
    if (verify.error) {
      toast({ title: 'Wrong code', description: 'Try again with a fresh 6-digit code.', variant: 'destructive' });
      return;
    }
    toast({ title: '2FA enabled' });
    setPending(null);
    setCode('');
    await refresh();
  }

  async function unenrol(factorId: string) {
    if (!confirm('Remove 2FA from this account? You can re-enrol any time.')) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      toast({ title: 'Could not remove 2FA', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: '2FA removed' });
    await refresh();
  }

  const activeFactor = factors?.find((f) => f.status === 'verified') ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security</h1>
        <p className="text-sm text-muted-foreground">
          Add two-factor authentication to protect your vendor account. We support time-based one-time passwords (TOTP) via Google Authenticator, 1Password, Authy and similar apps.
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

      {!loading && !activeFactor && !pending && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="font-semibold">2FA is off</p>
            <p className="text-sm text-muted-foreground">
              Anyone with your email and password can sign in. Add 2FA so a lost password is not enough on its own.
            </p>
            <Button onClick={startEnrol} disabled={enrolling} className="bg-vendor hover:bg-vendor-dark">
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
                Or paste the secret if you cannot scan: <code className="rounded bg-muted px-1 text-xs">{pending.secret}</code>
              </p>
            </div>
            {/* Supabase returns the QR as a data: URL so a plain img tag is safe. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pending.qr} alt="2FA QR code" className="h-48 w-48 rounded-md border bg-white p-2" />

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Keep your authenticator app installed and backed up. If you lose access, contact
              vendors@feastpot.co.uk and our team will remove 2FA after verifying your identity.
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
    </div>
  );
}

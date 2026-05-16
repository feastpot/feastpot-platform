'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { PageShell } from '@/components/layout/page-shell';
import { createClient } from '@/lib/supabase/client';

type Step = 'phone' | 'code';

/**
 * Phone-based sign-in via Supabase OTP.
 *
 * Step 1: collect E.164-style phone, send the code.
 * Step 2: collect 6-digit OTP — auto-submits the moment the 6th digit lands
 *   so the user doesn't need to tap a button.
 *
 * We deliberately keep the phone format permissive on the client (Supabase
 * does the strict validation server-side) and surface its error message
 * verbatim — the operator sees it before the customer would.
 */
export default function OtpSignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus the OTP input when transitioning to step 2.
  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus();
  }, [step]);

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({ phone });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setStep('code');
  };

  const verify = async (token: string) => {
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push('/');
    router.refresh();
  };

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void verify(digits);
  };

  return (
    <PageShell>
      <section className="space-y-4 py-6">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">Sign in with phone</h1>
          <p className="text-sm text-charcoal-mid">
            {step === 'phone'
              ? 'We&rsquo;ll text you a one-time code.'
              : `Enter the 6-digit code we sent to ${phone}.`}
          </p>
        </header>

        {step === 'phone' && (
          <form onSubmit={requestCode} className="space-y-3" noValidate>
            <label htmlFor="phone" className="mb-1 block text-sm font-bold text-charcoal">Phone number</label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder="+44 7700 900123"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-md border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={busy || phone.trim().length === 0}
              className="w-full rounded-xl bg-brand py-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === 6) void verify(code);
            }}
            className="space-y-3"
            noValidate
          >
            <label htmlFor="otp" className="mb-1 block text-sm font-bold text-charcoal">6-digit code</label>
            <input
              id="otp"
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-3 text-center text-xl tracking-[0.4em]"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              type="button"
              onClick={() => setStep('phone')}
              className="w-full rounded-md border border-cream-deep bg-white py-2.5 text-sm font-bold text-charcoal hover:bg-cream"
              disabled={busy}
            >
              Use a different number
            </button>
            {busy && <p className="text-center text-xs text-charcoal-mid">Verifying…</p>}
          </form>
        )}
      </section>
    </PageShell>
  );
}

'use client';

import { useState, type FormEvent } from 'react';

import { PageShell } from '@/components/layout/page-shell';

/**
 * Forgot-password - routes through the API so we can:
 *  - Apply server-side per-email rate limiting (3/hr)
 *  - Normalise response timing to prevent email-enumeration timing attacks
 *  - Embed the correct redirectTo without leaking the Supabase anon key
 *    into a client-side call
 *
 * Always shows a generic "check your email" state regardless of whether
 * the address is registered. Real errors are logged to the console for
 * ops debugging but never surfaced to the user.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch('/v1/auth/reset-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, app: 'customer' }),
      });
    } catch (err) {
      // Network error: still show the generic success state so the user
      // knows what to do, and we don't reveal whether the email was found.
      console.warn('[forgot-password] reset-request failed (non-fatal):', err);
    }
    setBusy(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <PageShell>
        <section className="space-y-3 py-10 text-center">
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">
            Check your email
          </h1>
          <p className="text-sm text-charcoal-mid">
            If an account exists for{' '}
            <strong className="break-all">{email}</strong>, you&rsquo;ll get a reset link
            shortly. The link expires after 60&nbsp;minutes.
          </p>
          <p className="text-xs text-charcoal-mid">
            Don&rsquo;t see it? Check your spam folder.
          </p>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="space-y-4 py-6">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">
            Reset your password
          </h1>
          <p className="text-sm text-charcoal-mid">
            Enter your account email and we&rsquo;ll send a reset link.
          </p>
        </header>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand py-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? 'Sending\u2026' : 'Send reset link'}
          </button>
        </form>
      </section>
    </PageShell>
  );
}

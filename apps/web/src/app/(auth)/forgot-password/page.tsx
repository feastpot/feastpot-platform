'use client';

import { useState, type FormEvent } from 'react';

import { PageShell } from '@/components/layout/page-shell';
import { createClient } from '@/lib/supabase/client';

/**
 * Forgot-password — sends a Supabase reset-password email. Always shows a
 * generic success state (even on error) so we don't leak whether an email is
 * registered. Real errors still log to the console for ops debugging.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/account`,
    });
    if (error) console.warn('[forgot-password]', error.message);
    setBusy(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <PageShell>
        <section className="space-y-3 py-10 text-center">
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">Check your email</h1>
          <p className="text-sm text-charcoal-mid">
            If an account exists for <strong className="break-all">{email}</strong>, you&rsquo;ll get a reset link shortly.
          </p>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="space-y-4 py-6">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">Reset your password</h1>
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
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      </section>
    </PageShell>
  );
}

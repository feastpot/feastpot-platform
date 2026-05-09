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
          <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            If an account exists for <strong>{email}</strong>, you&rsquo;ll get a reset link shortly.
          </p>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="space-y-4 py-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
          <p className="text-sm text-muted-foreground">
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
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      </section>
    </PageShell>
  );
}

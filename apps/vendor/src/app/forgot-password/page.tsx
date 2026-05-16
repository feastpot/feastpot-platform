'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Vendor forgot-password. Mirrors the customer app's version: always
 * shows a generic "check your email" state so we don't leak whether a
 * given address is a registered vendor. Real errors still log to the
 * console for ops debugging.
 */
export default function VendorForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Vendor portal has its own /auth/callback? Not yet — fall back to
      // the customer app's callback which sets the session cookie and
      // bounces to a safe destination. Long-term we should add a vendor
      // callback route, but a vendor confirming via email link already
      // gets routed back into the vendor portal by Supabase's redirect
      // allow-list.
      redirectTo: `${window.location.origin}/sign-in`,
    });
    if (error) console.warn('[vendor-forgot-password]', error.message);
    setBusy(false);
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-cream-warm px-4 py-10 sm:px-6">
      <Link
        href="/sign-in"
        aria-label="Feastpot vendor home"
        className="mb-8 inline-flex"
      >
        <Image
          src="/images/feastpot-logo.png"
          alt="Feastpot"
          width={317}
          height={100}
          className="h-9 w-auto"
          priority
        />
      </Link>

      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-card">
        {submitted ? (
          <div className="text-center">
            <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">
              Check your email
            </h1>
            <p className="mt-2 text-sm text-charcoal-mid">
              If a vendor account exists for{' '}
              <strong className="text-charcoal">{email}</strong>, we&rsquo;ll
              send a link to reset your password.
            </p>
            <Link
              href="/sign-in"
              className="mt-6 inline-block rounded-xl border border-cream-deep bg-white px-5 py-2.5 text-sm font-bold text-charcoal hover:bg-cream"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">
              Reset your password
            </h1>
            <p className="mt-2 text-sm text-charcoal-mid">
              Enter your vendor email and we&rsquo;ll send a reset link.
            </p>

            <form onSubmit={onSubmit} className="mt-5 space-y-3.5" noValidate>
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-[13px] font-semibold text-charcoal"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-cream-deep bg-white px-3.5 py-3 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-charcoal-mid">
              Remembered it?{' '}
              <Link
                href="/sign-in"
                className="font-bold text-brand hover:underline"
              >
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

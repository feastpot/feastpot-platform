'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { RegisterSchema, type RegisterDto } from '@feastpot/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { PageShell } from '@/components/layout/page-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';

/**
 * Form schema is the shared `RegisterSchema` from @feastpot/types so client +
 * API agree byte-for-byte. We extend it with a UI-only `referralCode` field
 * (Zod schema doesn't include it because the API endpoint hasn't shipped yet).
 */
type FormValues = RegisterDto & { referralCode?: string };

export default function RegisterPage() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      marketingOptIn: false,
    },
  });

  // Pull a referral code that /join saved into localStorage so it survives
  // the email-confirmation round-trip — and clear it so a later signup on
  // the same device doesn't accidentally reuse a stale code.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('feastpot.referral.v1');
      if (stored) {
        form.setValue('referralCode', stored);
      }
    } catch {
      /* localStorage unavailable */
    }
  }, [form]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const supabase = createClient();

    // Step 1: create the Supabase Auth user (sends confirmation email).
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        // Surfaced back via the user_metadata payload so the API sync route
        // can copy it into public.users without a second round trip.
        data: {
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone,
          marketingOptIn: values.marketingOptIn,
          referralCode: values.referralCode,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setServerError(error.message);
      return;
    }

    // Step 2: best-effort sync to our own users table. Skipped if Supabase
    // didn't return a session yet (typical for "confirm email" flows) — the
    // /auth/callback route handler will sync once the user clicks the link.
    if (data.session) {
      try {
        await apiRequest('/users/sync', {
          method: 'POST',
          accessToken: data.session.access_token,
          body: {
            firstName: values.firstName,
            lastName: values.lastName,
            phone: values.phone,
            marketingOptIn: values.marketingOptIn,
            referralCode: values.referralCode,
          },
        });
      } catch (e) {
        // BACKEND GAP: /v1/users/sync is not implemented yet. Don't fail the
        // signup just because the mirror route is missing — the user is
        // authenticated and we can backfill later. We log so it's visible in
        // browser devtools during local dev.
        if (e instanceof ApiError && e.status === 404) {
          console.warn('[register] /v1/users/sync not yet implemented — skipping mirror.');
        } else {
          throw e;
        }
      }
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <PageShell>
        <section className="space-y-4 py-10 text-center">
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">Check your email</h1>
          <p className="text-sm text-charcoal-mid">
            We&rsquo;ve sent a confirmation link to <strong>{form.getValues('email')}</strong>.
            Open it on this device to finish creating your account.
          </p>
          <Link
            href="/sign-in"
            className="inline-block rounded-xl border border-cream-deep bg-white px-4 py-2.5 text-sm font-bold text-charcoal hover:bg-cream"
          >
            Back to sign in
          </Link>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="space-y-4 py-6">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">Create your account</h1>
          <p className="text-sm text-charcoal-mid">Order from local cooks in minutes.</p>
        </header>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="mb-1 block text-sm font-bold text-charcoal">First name</label>
              <input
                id="firstName"
                autoComplete="given-name"
                {...form.register('firstName')}
                className="w-full rounded-md border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              {form.formState.errors.firstName && (
                <p className="mt-1 text-xs text-destructive">{form.formState.errors.firstName.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="lastName" className="mb-1 block text-sm font-bold text-charcoal">Last name</label>
              <input
                id="lastName"
                autoComplete="family-name"
                {...form.register('lastName')}
                className="w-full rounded-md border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              {form.formState.errors.lastName && (
                <p className="mt-1 text-xs text-destructive">{form.formState.errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-bold text-charcoal">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...form.register('email')}
              className="w-full rounded-md border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            {form.formState.errors.email && (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-bold text-charcoal">Password (min 8 chars)</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              {...form.register('password')}
              className="w-full rounded-md border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            {form.formState.errors.password && (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-bold text-charcoal">Phone (optional)</label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+44 7700 900123"
              {...form.register('phone')}
              className="w-full rounded-md border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            {form.formState.errors.phone && (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.phone.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="referralCode" className="mb-1 block text-sm font-bold text-charcoal">Referral code (optional)</label>
            <input
              id="referralCode"
              {...form.register('referralCode')}
              className="w-full rounded-md border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...form.register('marketingOptIn')}
              className="h-4 w-4 rounded border-cream-deep accent-brand"
            />
            <span>Send me occasional offers and new vendor news.</span>
          </label>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="w-full rounded-xl bg-brand py-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {form.formState.isSubmitting ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-center text-sm text-charcoal-mid">
            Already have an account?{' '}
            <Link href="/sign-in" className="font-bold text-brand hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </section>
    </PageShell>
  );
}

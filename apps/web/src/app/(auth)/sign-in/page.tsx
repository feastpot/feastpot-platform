'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema, type LoginDto } from '@feastpot/types';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';

import { PageShell } from '@/components/layout/page-shell';
import { createClient } from '@/lib/supabase/client';

function isSafeInternalPath(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (!value.startsWith('/')) return false;
  // `//host` → protocol-relative external URL.
  // `/\host` → some browsers normalise the backslash to `/`, same risk.
  if (value.startsWith('//') || value.startsWith('/\\')) return false;
  return true;
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Middleware redirects unauthenticated /account hits to `?next=…` — accept
  // both names so external links using `?redirect=` still work.
  //
  // Open-redirect guard: only honour internal app paths. An attacker who
  // gets a victim to click `/sign-in?next=https://evil.example/login`
  // would otherwise land them on a phishing clone the moment the
  // legitimate sign-in succeeds. We require a single leading slash and
  // explicitly reject `//host` and `/\host` (both interpreted as a
  // protocol-relative URL by the browser), as well as anything with a
  // scheme. Anything that fails the check silently falls back to `/`.
  const rawRedirect = params?.get('next') ?? params?.get('redirect') ?? '/';
  const redirect = isSafeInternalPath(rawRedirect) ? rawRedirect : '/';

  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<LoginDto>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginDto) => {
    setServerError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setServerError(error.message);
      setSubmitting(false);
      return;
    }
    router.push(redirect);
    router.refresh();
  };

  const onGoogle = async () => {
    setServerError(null);
    const supabase = createClient();
    // `redirectTo` MUST be an absolute URL — Supabase appends ?code=… and we
    // rely on /auth/callback to exchange it for a session cookie.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirect)}`,
      },
    });
    if (error) setServerError(error.message);
  };

  return (
    <PageShell>
      <section className="space-y-5 py-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Sign in to track orders and pay quickly.</p>
        </header>

        <button
          type="button"
          onClick={onGoogle}
          className="w-full rounded-md border border-border bg-background py-2 text-sm font-medium hover:bg-muted"
        >
          Continue with Google
        </button>

        <div className="relative my-2 text-center text-xs text-muted-foreground">
          <span className="bg-background px-2">or</span>
          <span className="absolute left-0 right-0 top-1/2 -z-10 border-t border-border" aria-hidden />
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...form.register('email')}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            {form.formState.errors.email && (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...form.register('password')}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            {form.formState.errors.password && (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <Link href="/sign-in/otp" className="underline-offset-2 hover:underline">
            Sign in with phone
          </Link>
          <div>
            <Link href="/forgot-password" className="underline-offset-2 hover:underline">
              Forgot password?
            </Link>
          </div>
          <div>
            New here?{' '}
            <Link href="/register" className="font-medium text-brand hover:underline">
              Create an account
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

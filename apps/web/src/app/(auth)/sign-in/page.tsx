'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema, type LoginDto } from '@feastpot/types';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Heart,
  Mail,
  MapPin,
  Package,
  Star,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';

import { safeRedirect } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/client';

const BENEFITS = [
  {
    Icon: Package,
    label: 'Track your orders',
    sub: 'Live updates to your door',
  },
  {
    Icon: MapPin,
    label: 'Saved addresses',
    sub: 'One tap faster checkout',
  },
  {
    Icon: Star,
    label: 'FeastPoints balance',
    sub: 'Earn, track and redeem',
  },
  {
    Icon: Heart,
    label: 'Your favourites',
    sub: 'Reorder what you love',
  },
];

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Middleware redirects unauthenticated /account hits to `?next=…` — accept
  // both names so external links using `?redirect=` still work. The
  // open-redirect guard lives in `safeRedirect` (see lib/safe-redirect.ts):
  // it rejects absolute URLs, protocol-relative `//host`, backslash tricks,
  // `..` traversal, and over-long values. Anything unsafe silently falls
  // back to `/`.
  const rawRedirect = params?.get('next') ?? params?.get('redirect') ?? null;
  const redirect = safeRedirect(rawRedirect, '/');
  const errorParam = params?.get('error') ?? null;

  const [serverError, setServerError] = useState<string | null>(errorParam);
  const [submitting, setSubmitting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [magicSending, setMagicSending] = useState(false);
  const [magicSentTo, setMagicSentTo] = useState<string | null>(null);

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
      setServerError('Invalid email or password. Please try again.');
      setSubmitting(false);
      return;
    }
    // "Remember me" is UI-honest about persistence: Supabase's web client
    // always persists to localStorage, so we record the preference here for
    // the middleware to honour on long-idle sessions later. Doing the full
    // ephemeral-storage swap would require a parallel Supabase client and
    // isn't worth the complexity for this iteration.
    try {
      window.localStorage.setItem(
        'feastpot.session.persist',
        rememberMe ? '1' : '0',
      );
    } catch {
      /* localStorage unavailable */
    }
    router.replace(redirect);
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
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          redirect,
        )}`,
      },
    });
    if (error) setServerError(error.message);
  };

  const onMagicLink = async () => {
    const email = form.getValues('email').trim();
    if (!email) {
      form.setError('email', { message: 'Enter your email to get a link' });
      return;
    }
    setMagicSending(true);
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          redirect,
        )}`,
      },
    });
    setMagicSending(false);
    if (error) {
      setServerError(error.message);
      return;
    }
    setMagicSentTo(email);
  };

  return (
    <div className="flex min-h-screen items-stretch bg-cream-warm">
      {/* LEFT — brand panel. Hidden on mobile (where the form is the whole
          surface); shown from `lg` up as a 42% rail. */}
      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-brand p-10 text-white lg:flex xl:p-12">
        <div className="relative z-10">
          <Link href="/" aria-label="Feastpot home" className="inline-block">
            <Image
              src="/images/feastpot-logo.png"
              alt="Feastpot"
              width={317}
              height={100}
              className="h-9 w-auto brightness-0 invert"
              priority
            />
          </Link>

          <h1 className="mt-9 font-display text-4xl font-black leading-tight tracking-tight xl:text-[40px]">
            Welcome back
          </h1>
          {/* Plantain underline accent — matches the register CTA. */}
          <div
            className="mt-3 h-[3px] w-16 rounded-full bg-plantain"
            aria-hidden
          />
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/80">
            Sign in to pick up where you left off. Manage orders, saved
            addresses, FeastPoints and your favourites.
          </p>

          <ul className="mt-8 space-y-4">
            {BENEFITS.map(({ Icon, label, sub }) => (
              <li key={label} className="flex items-center gap-3.5">
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/15"
                  aria-hidden
                >
                  <Icon className="h-[18px] w-[18px] text-white" />
                </span>
                <div>
                  <div className="text-sm font-bold">{label}</div>
                  <div className="text-xs text-white/65">{sub}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Food photography at bottom — asymmetric leaf-shaped crop. */}
        <div className="relative z-10 mt-8 self-center">
          <div
            className="relative h-[220px] w-[260px] overflow-hidden bg-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.25)]"
            style={{ borderRadius: '50% 50% 0 50%' }}
          >
            <Image
              src="/images/auth-hero-food.png"
              alt=""
              fill
              sizes="260px"
              className="object-cover"
            />
          </div>
        </div>

        {/* Decorative ambient blob */}
        <div
          aria-hidden
          className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/5 blur-3xl"
        />
      </aside>

      {/* RIGHT — sign in form */}
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          {/* Mobile-only header — the left rail is hidden under lg */}
          <div className="mb-7 lg:hidden">
            <Link href="/" aria-label="Feastpot home" className="inline-block">
              <Image
                src="/images/feastpot-logo.png"
                alt="Feastpot"
                width={317}
                height={100}
                className="h-9 w-auto"
                priority
              />
            </Link>
          </div>

          <h2 className="font-display text-2xl font-black tracking-tight text-charcoal">
            Sign in to your account
          </h2>
          <p className="mt-1 text-sm text-charcoal-mid lg:hidden">
            Welcome back — pick up where you left off.
          </p>

          {serverError && (
            <div
              role="alert"
              className="mt-5 rounded-lg bg-scotch/10 px-3 py-2.5 text-sm font-medium text-scotch"
            >
              {serverError}
            </div>
          )}

          {magicSentTo && (
            <div
              role="status"
              className="mt-5 flex items-start gap-2 rounded-lg bg-brand-light px-3 py-2.5 text-sm font-medium text-brand-dark"
            >
              <CheckCircle2
                className="mt-0.5 h-4 w-4 flex-shrink-0"
                aria-hidden
              />
              <span>
                Magic link sent to{' '}
                <strong className="font-bold">{magicSentTo}</strong>. Check
                your inbox.
              </span>
            </div>
          )}

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mt-6 space-y-3.5"
            noValidate
          >
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[13px] font-semibold text-charcoal"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...form.register('email')}
                className={`w-full rounded-lg border bg-white px-3.5 py-3 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/60 focus:outline-none focus:ring-2 focus:ring-brand/20 ${
                  form.formState.errors.email
                    ? 'border-scotch focus:border-scotch'
                    : 'border-cream-deep focus:border-brand'
                }`}
              />
              {form.formState.errors.email && (
                <p className="mt-1 text-xs font-medium text-scotch">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[13px] font-semibold text-charcoal"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  {...form.register('password')}
                  className={`w-full rounded-lg border bg-white px-3.5 py-3 pr-11 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/60 focus:outline-none focus:ring-2 focus:ring-brand/20 ${
                    form.formState.errors.password
                      ? 'border-scotch focus:border-scotch'
                      : 'border-cream-deep focus:border-brand'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-mid hover:text-charcoal"
                >
                  {showPwd ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="mt-1 text-xs font-medium text-scotch">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-cream-deep accent-brand"
                />
                <span className="text-[13px] text-charcoal">Remember me</span>
              </label>
              <Link
                href="/forgot-password"
                className="text-[13px] font-semibold text-brand hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="py-1 text-center text-[13px] font-medium text-charcoal-mid">
              or
            </div>

            <button
              type="button"
              onClick={onMagicLink}
              disabled={magicSending}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-cream-deep bg-white py-3 text-sm font-semibold text-charcoal hover:bg-cream disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Mail className="h-4 w-4" aria-hidden />
              {magicSending ? 'Sending…' : 'Request magic link'}
            </button>

            <button
              type="button"
              onClick={onGoogle}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-cream-deep bg-white py-3 text-sm font-semibold text-charcoal hover:bg-cream"
            >
              Continue with Google
            </button>

            <div className="space-y-1.5 pt-3 text-center text-sm text-charcoal-mid">
              <p>
                New to FeastPot?{' '}
                <Link
                  href="/register"
                  className="font-bold text-brand hover:underline"
                >
                  Create account
                </Link>
              </p>
              <p>
                <Link
                  href="/sign-in/otp"
                  className="underline-offset-2 hover:underline"
                >
                  Sign in with phone instead
                </Link>
              </p>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

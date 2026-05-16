'use client';

import {
  ClipboardList,
  CreditCard,
  Eye,
  EyeOff,
  MessageCircle,
  Pencil,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Lightweight open-redirect guard. The customer app has `lib/safe-redirect`
 * for this; the vendor app didn't, so we keep the rules inline rather than
 * pull in a new lib for two callers. Rejects: absolute URLs, protocol-
 * relative `//host`, `\` backslash tricks, `..` traversal, over-long values.
 */
function safeNext(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (raw.length > 512) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (raw.includes('..')) return fallback;
  return raw;
}

const VENDOR_BENEFITS = [
  {
    Icon: ClipboardList,
    label: 'Manage orders',
    sub: 'View and manage incoming orders',
  },
  {
    Icon: Pencil,
    label: 'Update your menu',
    sub: 'Add dishes, edit prices, update availability',
  },
  {
    Icon: CreditCard,
    label: 'Track payouts',
    sub: 'See your earnings and payout history',
  },
];

export default function VendorSignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'), '/orders');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter your email and password');
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('Invalid email or password.');
        return;
      }

      // Vendor portal is role-gated. The middleware also enforces this on
      // every request, but rejecting here keeps the user out of the portal
      // shell entirely and shows a clearer "wrong portal" message instead
      // of bouncing to /unauthorized after a flash of dashboard chrome.
      const role = (data.user?.user_metadata?.role ?? data.user?.app_metadata?.role) as
        | string
        | undefined;
      if (role !== 'vendor' && role !== 'admin') {
        await supabase.auth.signOut();
        setError(
          'This account does not have vendor access. Please use the customer sign-in.',
        );
        return;
      }

      try {
        window.localStorage.setItem(
          'feastpot.vendor.session.persist',
          rememberMe ? '1' : '0',
        );
      } catch {
        /* localStorage unavailable */
      }

      router.replace(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-stretch bg-cream-warm">
      {/* LEFT — brand-green rail (hidden under lg) */}
      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-brand p-10 text-white lg:flex xl:p-12">
        <div className="relative z-10">
          <Link
            href="/sign-in"
            aria-label="Feastpot vendor home"
            className="inline-block"
          >
            <Image
              src="/images/feastpot-logo.png"
              alt="Feastpot"
              width={317}
              height={100}
              className="h-9 w-auto brightness-0 invert"
              priority
            />
          </Link>

          <h1 className="mt-9 font-display text-[34px] font-black leading-tight tracking-tight xl:text-[38px]">
            Welcome back,
            <br />
            vendor
          </h1>
          <div
            className="mt-3 h-[3px] w-16 rounded-full bg-plantain"
            aria-hidden
          />
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/80">
            Log in to manage orders, update your menu, and grow your food
            business.
          </p>

          <ul className="mt-8 space-y-4">
            {VENDOR_BENEFITS.map(({ Icon, label, sub }) => (
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

        {/* Food/spice photo at bottom — asymmetric leaf-shaped crop. */}
        <div className="relative z-10 mt-8 self-center">
          <div
            className="relative h-[200px] w-[260px] overflow-hidden bg-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.25)]"
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

        <div
          aria-hidden
          className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/5 blur-3xl"
        />
      </aside>

      {/* RIGHT — sign in form */}
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 lg:hidden">
            <Link
              href="/sign-in"
              aria-label="Feastpot vendor home"
              className="inline-block"
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
          </div>

          <h2 className="font-display text-[22px] font-black tracking-tight text-charcoal">
            Sign in to your vendor account
          </h2>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-lg bg-scotch/10 px-3 py-2.5 text-sm font-medium text-scotch"
            >
              {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-3.5" noValidate>
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
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-cream-deep bg-white px-3.5 py-3 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-cream-deep bg-white px-3.5 py-3 pr-11 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-charcoal-mid hover:text-charcoal"
                >
                  {showPwd ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
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
                className="-mr-2 inline-flex min-h-11 items-center px-2 text-[13px] font-semibold text-brand hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-4 py-3.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="py-1 text-center text-[13px] font-medium text-charcoal-mid">
              or
            </div>

            <Link
              href="/onboarding/register"
              className="flex min-h-12 w-full items-center justify-center rounded-xl border border-cream-deep bg-white py-3 text-sm font-semibold text-charcoal hover:bg-cream"
            >
              Request access
            </Link>

            <p className="pt-2 text-center text-sm text-charcoal-mid">
              New to FeastPot?{' '}
              <Link
                href="/onboarding/register"
                className="font-bold text-brand hover:underline"
              >
                Register interest
              </Link>
            </p>
          </form>

          <div className="mt-6 border-t border-cream-deep pt-4 text-center">
            <a
              href="mailto:vendors@feastpot.co.uk"
              className="inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              Need help? Contact{' '}
              <span className="font-bold">vendor support</span>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

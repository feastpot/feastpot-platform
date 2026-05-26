'use client';

import {
  ArrowRight,
  Check,
  ClipboardList,
  CreditCard,
  Eye,
  EyeOff,
  Headphones,
  Lock,
  Mail,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

import { API_URL } from '@/lib/env';
import { createClient } from '@/lib/supabase/client';

/**
 * Lightweight open-redirect guard. Same rules as before - rejects
 * absolute URLs, protocol-relative `//host`, backslash tricks,
 * `..` traversal, and anything over 512 chars.
 */
function safeNext(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (raw.length > 512) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (raw.includes('..')) return fallback;
  return raw;
}

/**
 * Brand palette for the sign-in surface only. Literal hex rather than
 * Tailwind tokens because (a) the vendor app's tailwind.config does NOT
 * declare `plantain` / `scotch` / `charcoal` etc. (the previous version
 * used them and they silently no-op'd to default colours) and (b) this
 * surface is one-off enough that lifting them into the global theme
 * would be over-reach.
 */
const C = {
  green: '#00843D',
  greenDark: '#005C2B',
  yellow: '#F4B400',
  yellowSoft: '#FBD96A',
  red: '#E0322D',
  cream: '#F8F4EB',
  ink: '#1A1A1A',
  inkMid: '#666666',
  border: '#E5E5E5',
} as const;

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
  // Browsers (Chrome/Safari especially) aggressively autofill saved
  // credentials on /sign-in regardless of `autocomplete` hints. Holding
  // the inputs readOnly until they receive focus defeats the silent
  // prefill while still letting the user (and password managers
  // triggered by an explicit user gesture) populate them normally.
  const [emailReady, setEmailReady] = useState(false);
  const [pwdReady, setPwdReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MFA challenge state. Populated when the signed-in user has a verified
  // TOTP factor and Supabase tells us their next required AAL is `aal2`.
  // We hold on to the resolved role so the post-challenge redirect re-uses
  // the same role gate as the password-only path.
  const [mfa, setMfa] = useState<{
    factorId: string;
    role: 'vendor' | 'admin';
  } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');

  /**
   * Common post-sign-in tail: gate on role, persist "remember me" pref,
   * then redirect to `next`. Used by both the password-only and the
   * post-MFA paths so the two stay in sync.
   */
  async function finishSignIn(role: 'vendor' | 'admin') {
    try {
      window.localStorage.setItem(
        'feastpot.vendor.session.persist',
        rememberMe ? '1' : '0',
      );
    } catch {
      /* localStorage unavailable */
    }
    void role;
    router.replace(next);
    router.refresh();
  }

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

      // Role-gate at the page so the wrong-portal case shows a clean
      // message instead of a flash of dashboard chrome before middleware
      // bounces the request.
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

      // If 2FA is enrolled, Supabase returns an aal1 session and tells us
      // the next required level is aal2. Switch to the challenge view
      // instead of redirecting; the user is technically signed in but
      // protected routes will reject aal1.
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const nextLevel = aal.data?.nextLevel;
      const currentLevel = aal.data?.currentLevel;
      if (nextLevel === 'aal2' && currentLevel !== 'aal2') {
        const factors = await supabase.auth.mfa.listFactors();
        const totp = factors.data?.totp?.find((f) => f.status === 'verified');
        if (totp) {
          setMfa({ factorId: totp.id, role: role as 'vendor' | 'admin' });
          // Pre-fill recovery form so the user doesn't retype.
          setRecoveryEmail(email);
          setRecoveryPassword(password);
          return;
        }
      }

      await finishSignIn(role as 'vendor' | 'admin');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Submit the 6-digit TOTP. On success the session is upgraded to aal2
   * and we run the same finishSignIn tail as the password-only path.
   */
  async function submitMfa(e: FormEvent) {
    e.preventDefault();
    if (!mfa || mfaCode.length !== 6) return;
    setMfaBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: mfa.factorId });
      if (challenge.error || !challenge.data) {
        setError('Could not start the 2FA challenge. Please try again.');
        return;
      }
      const verify = await supabase.auth.mfa.verify({
        factorId: mfa.factorId,
        challengeId: challenge.data.id,
        code: mfaCode.trim(),
      });
      if (verify.error) {
        setError('Wrong code. Try again with a fresh 6-digit code from your authenticator app.');
        return;
      }
      await finishSignIn(mfa.role);
    } finally {
      setMfaBusy(false);
    }
  }

  /**
   * Recovery path. We POST the code to the API using the current
   * (aal1) session token. The server verifies the hash, deletes every
   * TOTP factor on the user, and returns 200. We then re-run password
   * sign-in so the resulting session has no MFA prompt.
   */
  async function submitRecovery(e: FormEvent) {
    e.preventDefault();
    if (!recoveryCode || recoveryCode.replace(/[^a-zA-Z0-9]/g, '').length < 8) {
      setError('Enter a full recovery code.');
      return;
    }
    setMfaBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      // Re-sign-in with password to make sure we have a fresh aal1
      // session bound to the credentials the user just typed - the
      // existing session might be stale if they idled on the page.
      const reAuth = await supabase.auth.signInWithPassword({
        email: recoveryEmail,
        password: recoveryPassword,
      });
      if (reAuth.error || !reAuth.data.session) {
        setError('Email or password is incorrect.');
        return;
      }
      const token = reAuth.data.session.access_token;
      const res = await fetch(`${API_URL}/v1/mfa/recovery-codes/consume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: recoveryCode }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(
          body?.message ??
            'That recovery code is not recognised or has already been used.',
        );
        return;
      }
      // Factor removed. Re-sign-in once more; this time getAuthenticatorAssuranceLevel
      // will report aal1/aal1 and we go straight through.
      await supabase.auth.signOut();
      const finalAuth = await supabase.auth.signInWithPassword({
        email: recoveryEmail,
        password: recoveryPassword,
      });
      if (finalAuth.error) {
        setError('Sign-in failed after recovery. Please try signing in again.');
        return;
      }
      await finishSignIn(mfa?.role ?? 'vendor');
    } finally {
      setMfaBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-stretch" style={{ background: C.cream }}>
      {/* =========================== LEFT BRAND RAIL =========================== */}
      <aside
        className="relative hidden w-1/2 overflow-hidden lg:flex lg:flex-col"
        style={{ background: C.green }}
      >
        {/* Yellow blob curving in from the top-right of the rail. Pure
            SVG so it scales crisply with the viewport. */}
        <svg
          aria-hidden
          viewBox="0 0 600 800"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <path
            d="M600,0 L600,360 C540,330 470,300 420,250 C360,190 380,90 460,0 Z"
            fill={C.yellow}
          />
          {/* Red sliver tucked into the bottom-left corner. */}
          <path
            d="M0,720 L0,800 L160,800 C90,790 30,760 0,720 Z"
            fill={C.red}
          />
          {/* Faint outline doodles - decorative kitchen marks, ~6% alpha
              white so they read as embossed texture rather than content. */}
          <g stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" fill="none">
            <circle cx="220" cy="240" r="60" />
            <path d="M180 280 Q220 220 260 280" />
            <path d="M340 420 Q370 400 400 430 Q420 460 390 470" />
            <circle cx="120" cy="500" r="36" />
          </g>
        </svg>

        {/* Yellow dot pattern bottom-left of rail. */}
        <div
          aria-hidden
          className="absolute bottom-10 left-10 h-16 w-24 opacity-80"
          style={{
            backgroundImage: `radial-gradient(${C.yellow} 1.4px, transparent 1.6px)`,
            backgroundSize: '10px 10px',
          }}
        />

        <div className="relative z-10 flex h-full flex-col p-10 text-white xl:p-12">
          {/* Logo cluster - the pot mark from /images/feastpot-logo.png
              and the wordmark are baked into the same PNG, so we render
              the asset as-is rather than recompositing it. */}
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
              className="h-10 w-auto"
              priority
            />
          </Link>

          <h1 className="mt-10 text-[44px] font-black leading-[1.05] tracking-tight xl:text-[52px]">
            Welcome back,
            <br />
            <span style={{ color: C.yellow }}>vendor</span>
          </h1>

          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/85">
            Log in to manage orders, update your menu,
            <br className="hidden xl:block" />
            and grow your food business.
          </p>

          <ul className="mt-9 space-y-5">
            {VENDOR_BENEFITS.map(({ Icon, label, sub }) => (
              <li key={label} className="flex items-center gap-4">
                <span
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl"
                  style={{ background: C.greenDark }}
                  aria-hidden
                >
                  <Icon className="h-5 w-5" style={{ color: C.yellowSoft }} />
                </span>
                <div>
                  <div className="text-[15px] font-bold leading-tight">{label}</div>
                  <div className="text-[13px] text-white/70">{sub}</div>
                </div>
              </li>
            ))}
          </ul>

          {/* Food photo - clean rounded rectangle anchored to the
              bottom of the rail. */}
          <div className="relative mt-auto self-start">
            <div
              className="relative h-[210px] w-[320px] overflow-hidden rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.30)]"
            >
              <Image
                src="/images/auth-hero-food.png"
                alt=""
                fill
                sizes="320px"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </aside>

      {/* =========================== RIGHT FORM SIDE =========================== */}
      <main className="relative flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        {/* Yellow dot pattern decoration top-right of the form side. */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-8 top-10 h-24 w-32 opacity-70"
          style={{
            backgroundImage: `radial-gradient(${C.yellow} 1.4px, transparent 1.6px)`,
            backgroundSize: '12px 12px',
          }}
        />

        <div
          className="relative z-10 w-full max-w-[440px] rounded-3xl bg-white p-8 shadow-[0_8px_40px_rgba(0,0,0,0.08)] sm:p-10"
        >
          {/* Mobile logo - shown only when the left rail is collapsed. */}
          <div className="mb-5 lg:hidden">
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

          {/* Shield seal */}
          <div className="mb-5 flex justify-center">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: C.cream }}
              aria-hidden
            >
              <ShieldCheck className="h-6 w-6" style={{ color: C.green }} />
            </span>
          </div>

          <h2
            className="text-center text-[22px] font-black tracking-tight"
            style={{ color: C.ink }}
          >
            {mfa
              ? showRecovery
                ? 'Use a recovery code'
                : 'Two-factor authentication'
              : 'Sign in to your vendor account'}
          </h2>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-lg px-3 py-2.5 text-sm font-medium"
              style={{ background: '#FDE7E6', color: '#9B1B17' }}
            >
              {error}
            </div>
          )}

          {mfa && !showRecovery && (
            <form onSubmit={submitMfa} className="mt-6 space-y-4" noValidate>
              <p className="text-center text-sm" style={{ color: C.inkMid }}>
                Enter the 6-digit code from your authenticator app.
              </p>
              <div>
                <label
                  htmlFor="mfa-code"
                  className="mb-1.5 block text-[13px] font-semibold"
                  style={{ color: C.ink }}
                >
                  Authentication code
                </label>
                <input
                  id="mfa-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoFocus
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-xl border bg-white px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] outline-none"
                  style={{ borderColor: C.border, color: C.ink }}
                  placeholder="000000"
                />
              </div>
              <button
                type="submit"
                disabled={mfaBusy || mfaCode.length !== 6}
                className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: C.green }}
              >
                <span>{mfaBusy ? 'Verifying…' : 'Verify'}</span>
                {!mfaBusy && <ArrowRight className="h-4 w-4" aria-hidden />}
              </button>
              <div className="flex flex-col items-center gap-2 pt-2">
                <button
                  type="button"
                  className="text-[13px] font-semibold hover:underline"
                  style={{ color: C.green }}
                  onClick={() => {
                    setError(null);
                    setShowRecovery(true);
                  }}
                >
                  Use a recovery code instead
                </button>
                <button
                  type="button"
                  className="text-[12px] hover:underline"
                  style={{ color: C.inkMid }}
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.signOut();
                    setMfa(null);
                    setMfaCode('');
                    setError(null);
                  }}
                >
                  Cancel and sign in as a different user
                </button>
              </div>
            </form>
          )}

          {mfa && showRecovery && (
            <form onSubmit={submitRecovery} className="mt-6 space-y-4" noValidate>
              <p className="text-sm" style={{ color: C.inkMid }}>
                Enter one of the recovery codes you saved when you enabled 2FA. Using a recovery
                code will remove 2FA from your account; you can re-enrol from the security page
                once you are signed in.
              </p>
              <div>
                <label
                  htmlFor="recovery-code"
                  className="mb-1.5 block text-[13px] font-semibold"
                  style={{ color: C.ink }}
                >
                  Recovery code
                </label>
                <input
                  id="recovery-code"
                  autoFocus
                  autoComplete="off"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  className="w-full rounded-xl border bg-white px-4 py-3 text-center font-mono text-base tracking-widest outline-none"
                  style={{ borderColor: C.border, color: C.ink }}
                  placeholder="xxxxx-xxxxx"
                />
              </div>
              <button
                type="submit"
                disabled={mfaBusy}
                className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: C.green }}
              >
                <span>{mfaBusy ? 'Verifying…' : 'Use recovery code'}</span>
                {!mfaBusy && <ArrowRight className="h-4 w-4" aria-hidden />}
              </button>
              <button
                type="button"
                className="block w-full text-center text-[13px] font-semibold hover:underline"
                style={{ color: C.green }}
                onClick={() => {
                  setError(null);
                  setShowRecovery(false);
                }}
              >
                Back to authenticator code
              </button>
            </form>
          )}

          {!mfa && (
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate autoComplete="off">
            {/* Honeypot pair: most autofill engines target the first
                email + password they see in document order. We offer
                them these throwaway fields (visually hidden, never
                read by us) so the real fields stay empty. */}
            <div aria-hidden className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <input type="text" name="fakeusernameremembered" tabIndex={-1} autoComplete="username" />
              <input type="password" name="fakepasswordremembered" tabIndex={-1} autoComplete="current-password" />
            </div>
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[13px] font-semibold"
                style={{ color: C.ink }}
              >
                Email
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: C.inkMid }}
                  aria-hidden
                />
                <input
                  id="email"
                  name="vendor-email"
                  type="email"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  readOnly={!emailReady}
                  onFocus={() => setEmailReady(true)}
                  placeholder="you@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border bg-white py-3 pl-10 pr-3.5 text-sm font-medium outline-none transition-colors focus:border-[color:var(--fp-green,#00843D)] focus:ring-2"
                  style={{
                    borderColor: C.border,
                    color: C.ink,
                    // @ts-expect-error - CSS var passed through for focus colour
                    '--fp-green': C.green,
                    boxShadow: 'none',
                  }}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[13px] font-semibold"
                style={{ color: C.ink }}
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: C.inkMid }}
                  aria-hidden
                />
                <input
                  id="password"
                  name="vendor-password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoCorrect="off"
                  spellCheck={false}
                  readOnly={!pwdReady}
                  onFocus={() => setPwdReady(true)}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border bg-white py-3 pl-10 pr-11 text-sm font-medium outline-none"
                  style={{ borderColor: C.border, color: C.ink }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center"
                  style={{ color: C.inkMid }}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer select-none items-center gap-2">
                {/* Custom green-filled checkbox - styled to match the
                    mockup exactly. Visually hidden native input keeps
                    keyboard + a11y semantics intact. */}
                <span className="relative inline-flex h-5 w-5 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border"
                    style={{ borderColor: C.border, accentColor: C.green }}
                  />
                  <span
                    className="pointer-events-none absolute inset-0 hidden items-center justify-center rounded-md peer-checked:flex"
                    style={{ background: C.green }}
                  >
                    <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                  </span>
                </span>
                <span className="text-[13px]" style={{ color: C.ink }}>
                  Remember me
                </span>
              </label>
              <Link
                href="/forgot-password"
                className="-mr-2 inline-flex min-h-11 items-center px-2 text-[13px] font-semibold hover:underline"
                style={{ color: C.green }}
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: C.green }}
              onMouseEnter={(e) => {
                if (!busy) e.currentTarget.style.background = C.greenDark;
              }}
              onMouseLeave={(e) => {
                if (!busy) e.currentTarget.style.background = C.green;
              }}
            >
              <span>{busy ? 'Signing in…' : 'Sign in'}</span>
              {!busy && <ArrowRight className="h-4 w-4" aria-hidden />}
            </button>

          </form>
          )}

          <div
            className="mt-6 border-t pt-4 text-center"
            style={{ borderColor: C.border }}
          >
            <a
              href="mailto:vendors@feastpot.co.uk"
              className="inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold hover:underline"
              style={{ color: C.green }}
            >
              <Headphones className="h-4 w-4" aria-hidden />
              <span style={{ color: C.ink }}>Need help?</span> Contact vendor support
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

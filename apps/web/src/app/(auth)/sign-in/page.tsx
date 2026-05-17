'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  LoginSchema,
  RegisterSchema,
  type LoginDto,
} from '@feastpot/types';
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Gift,
  Lock,
  Mail,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { apiRequest, ApiError } from '@/lib/api/client';
import { safeRedirect } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/client';

/**
 * One-page customer auth.
 *
 * One URL (`/sign-in`), two modes ("signin" | "register") toggled with a
 * tab control. The active mode is mirrored to the `?mode=` query param via
 * `router.replace()` so:
 *   - deep links work (`/sign-in?mode=register`)
 *   - back/forward buttons land on the right tab
 *   - there is no full-page navigation when switching tabs
 *
 * Both old routes redirect here from the server (see
 * `register/page.tsx` and `register/create-account/page.tsx`).
 */
type Mode = 'signin' | 'register';

// ── REGISTER form schema ────────────────────────────────────────────────
// Mirrors the register/create-account schema so we keep one source of truth
// for what the API accepts. UI captures a single `fullName` + adds
// `confirmPassword`, `postcode`, `termsAccepted`, `referralCode`; we
// split / strip those before submitting to Supabase Auth + /users/sync.
const RegisterFormSchema = RegisterSchema.omit({
  firstName: true,
  lastName: true,
})
  .extend({
    fullName: z
      .string()
      .min(1, 'Full name is required')
      .max(200, 'Name is too long')
      .refine((v) => v.trim().includes(' '), 'Enter your first and last name')
      .refine((v) => {
        const { firstName, lastName } = splitName(v);
        return firstName.length <= 100 && lastName.length <= 100;
      }, 'First and last name must each be 100 characters or fewer'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    postcode: z
      .string()
      .min(1, 'Enter your postcode or service area')
      .max(20),
    termsAccepted: z
      .boolean()
      .refine((v) => v === true, {
        message: 'You must accept the Terms and Privacy Policy',
      }),
    referralCode: z.string().optional(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type RegisterFormValues = z.infer<typeof RegisterFormSchema>;

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  const last = parts.pop() ?? '';
  return { firstName: parts.join(' ') || last, lastName: last };
}

function AuthShell() {
  const router = useRouter();
  const params = useSearchParams();

  // Initial mode is read once from the URL. After that, tab clicks are the
  // source of truth and we push back into the URL via router.replace().
  const initialMode: Mode = useMemo(
    () => (params?.get('mode') === 'register' ? 'register' : 'signin'),
    // Only consider URL state on first paint — switching the local tab
    // updates the URL itself, so re-deriving from params would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [mode, setMode] = useState<Mode>(initialMode);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    const sp = new URLSearchParams(params?.toString() ?? '');
    if (next === 'register') sp.set('mode', 'register');
    else sp.delete('mode');
    const qs = sp.toString();
    router.replace(qs ? `/sign-in?${qs}` : '/sign-in', { scroll: false });
  };

  return (
    <div className="min-h-screen bg-cream-warm px-4 py-10 sm:px-6 lg:py-14">
      <div className="mx-auto grid w-full max-w-6xl items-start gap-8 lg:grid-cols-[1fr_minmax(0,520px)] lg:gap-12">
        <WelcomePanel />
        <section
          aria-label={mode === 'signin' ? 'Sign in' : 'Create account'}
          className="rounded-2xl bg-white p-6 shadow-card sm:p-8"
        >
          <TabSwitcher mode={mode} onChange={switchMode} />
          {mode === 'signin' ? (
            <SignInPane onSwitchToRegister={() => switchMode('register')} />
          ) : (
            <RegisterPane onSwitchToSignIn={() => switchMode('signin')} />
          )}
        </section>
      </div>
    </div>
  );
}

// ── Left rail: brand welcome + value props ──────────────────────────────
function WelcomePanel() {
  return (
    <aside className="flex flex-col">
      <div className="inline-flex w-fit items-center rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-dark">
        One dynamic auth screen
      </div>

      <h1 className="mt-5 font-display text-4xl font-black leading-[1.05] tracking-tight text-charcoal sm:text-5xl">
        Welcome to
        <br />
        {/* Per-letter wordmark matching the brand logo: F-green, e-red,
            a-gold, st-green, Pot-charcoal. Kept inline (vs a shared
            component) because there are only two sites and the JSX is
            self-documenting at the call site. */}
        <span className="text-brand">F</span>
        <span className="text-scotch">e</span>
        <span className="text-plantain">a</span>
        <span className="text-brand">st</span>
        <span className="text-charcoal">Pot</span>
      </h1>

      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-charcoal-mid">
        Sign in or create your account without leaving the page. The URL stays
        the same and only the relevant form fields are rendered.
      </p>

      {/* Order-faster-next-time card */}
      <div className="mt-7 rounded-2xl bg-brand p-6 text-white shadow-card">
        <p className="font-display text-[22px] font-black leading-tight">
          Order faster next time
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-[13.5px] font-medium sm:grid-cols-2">
          {[
            'Save delivery addresses',
            'Track orders',
            'Earn FeastPoints',
            'Reorder favourites',
            'Store allergen notes',
            'Refer friends',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <Check
                className="mt-0.5 h-4 w-4 flex-shrink-0"
                strokeWidth={3}
                aria-hidden
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Three mini cards */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <MiniCard Icon={ShieldCheck} label="Secure login" tone="brand" />
        <MiniCard Icon={Gift} label="Rewards ready" tone="plantain" />
        <MiniCard
          Icon={TriangleAlert}
          label="Allergen profile"
          tone="scotch"
        />
      </div>
    </aside>
  );
}

function MiniCard({
  Icon,
  label,
  tone,
}: {
  Icon: typeof ShieldCheck;
  label: string;
  tone: 'brand' | 'plantain' | 'scotch';
}) {
  const toneClass =
    tone === 'brand'
      ? 'text-brand'
      : tone === 'plantain'
        ? 'text-plantain'
        : 'text-scotch';
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border border-cream-deep bg-white p-4 shadow-card">
      <Icon className={`h-5 w-5 ${toneClass}`} aria-hidden strokeWidth={2.25} />
      <p className="text-[12.5px] font-bold leading-snug text-charcoal">
        {label}
      </p>
    </div>
  );
}

// ── Tab control ─────────────────────────────────────────────────────────
function TabSwitcher({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Authentication mode"
      className="grid grid-cols-2 gap-2 rounded-xl bg-cream-warm p-1"
    >
      {(['signin', 'register'] as const).map((m) => {
        const active = mode === m;
        const label = m === 'signin' ? 'Sign in' : 'Create account';
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`auth-pane-${m}`}
            onClick={() => onChange(m)}
            className={`min-h-11 rounded-lg px-4 text-sm font-bold transition-colors ${
              active
                ? 'bg-brand text-white shadow-card'
                : 'text-charcoal-mid hover:text-charcoal'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── SIGN-IN pane ────────────────────────────────────────────────────────
function SignInPane({
  onSwitchToRegister,
}: {
  onSwitchToRegister: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const rawRedirect =
    params?.get('next') ?? params?.get('redirect') ?? null;
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

  const onGoogle = async () => {
    setServerError(null);
    const supabase = createClient();
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

  return (
    <div
      id="auth-pane-signin"
      role="tabpanel"
      aria-labelledby="signin-heading"
      className="mt-6"
    >
      <h2
        id="signin-heading"
        className="font-display text-2xl font-black tracking-tight text-charcoal"
      >
        Sign in to FeastPot
      </h2>
      <p className="mt-1 text-sm text-charcoal-mid">
        Access your orders, saved addresses, FeastPoints and favourites.
      </p>

      {serverError && (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-scotch/10 px-3 py-2.5 text-sm font-medium text-scotch"
        >
          {serverError}
        </div>
      )}

      {magicSentTo && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2 rounded-lg bg-brand-light px-3 py-2.5 text-sm font-medium text-brand-dark"
        >
          <CheckCircle2
            className="mt-0.5 h-4 w-4 flex-shrink-0"
            aria-hidden
          />
          <span className="min-w-0 break-words">
            Magic link sent to{' '}
            <strong className="font-bold break-all">{magicSentTo}</strong>.
            Check your inbox.
          </span>
        </div>
      )}

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mt-5 space-y-3.5"
        noValidate
      >
        <TextField
          id="signin-email"
          type="email"
          label="Email address"
          autoComplete="email"
          placeholder="you@email.com"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <PasswordField
          id="signin-password"
          label="Password"
          autoComplete="current-password"
          placeholder="Enter your password"
          show={showPwd}
          onToggle={() => setShowPwd((v) => !v)}
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />

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
          disabled={submitting}
          className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-4 py-3.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="flex items-center gap-3 pt-2">
          <span className="h-px flex-1 bg-cream-deep" />
          <span className="text-xs font-medium text-charcoal-mid">or</span>
          <span className="h-px flex-1 bg-cream-deep" />
        </div>

        <button
          type="button"
          onClick={onMagicLink}
          disabled={magicSending}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-cream-deep bg-white py-3 text-sm font-semibold text-charcoal hover:bg-cream disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Mail className="h-4 w-4" aria-hidden />
          {magicSending ? 'Sending…' : 'Continue with magic link'}
        </button>

        <button
          type="button"
          onClick={onGoogle}
          className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-cream-deep bg-white py-3 text-sm font-semibold text-charcoal hover:bg-cream"
        >
          <GoogleLogo className="h-4 w-4" /> Continue with Google
        </button>

        <p className="pt-2 text-center text-sm text-charcoal-mid">
          New to FeastPot?{' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="font-bold text-brand hover:underline"
          >
            Create account
          </button>
        </p>
        <p className="text-center text-sm text-charcoal-mid">
          <Link
            href="/sign-in/otp"
            className="underline-offset-2 hover:underline"
          >
            Sign in with phone instead
          </Link>
        </p>
      </form>
    </div>
  );
}

// ── REGISTER pane ───────────────────────────────────────────────────────
function RegisterPane({
  onSwitchToSignIn,
}: {
  onSwitchToSignIn: () => void;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [showCpwd, setShowCpwd] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(RegisterFormSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      fullName: '',
      phone: '',
      postcode: '',
      marketingOptIn: false,
      termsAccepted: false,
    },
  });

  // Pull a referral code that /join saved into localStorage so it survives
  // the email-confirmation round-trip.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('feastpot.referral.v1');
      if (stored) form.setValue('referralCode', stored);
    } catch {
      /* localStorage unavailable */
    }
  }, [form]);

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    const supabase = createClient();
    const { firstName, lastName } = splitName(values.fullName);
    const phone = values.phone?.trim() || undefined;
    const postcode = values.postcode.toUpperCase().trim();

    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          firstName,
          lastName,
          phone,
          postcode,
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

    if (data.session) {
      try {
        await apiRequest('/users/sync', {
          method: 'POST',
          accessToken: data.session.access_token,
          body: {
            firstName,
            lastName,
            phone,
            marketingOptIn: values.marketingOptIn,
            referralCode: values.referralCode,
          },
        });
      } catch (e) {
        // Don't fail the signup if the mirror route is missing.
        if (e instanceof ApiError && e.status === 404) {
          console.warn(
            '[register] /v1/users/sync not yet implemented — skipping mirror.',
          );
        } else {
          throw e;
        }
      }
    }

    setSubmitted(true);
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setServerError(error.message);
  };

  const fieldError = (k: keyof RegisterFormValues) =>
    form.formState.errors[k]?.message as string | undefined;

  if (submitted) {
    return (
      <div
        id="auth-pane-register"
        role="tabpanel"
        className="mt-6 rounded-2xl bg-cream-warm p-6 text-center"
      >
        <h2 className="font-display text-2xl font-black tracking-tight text-charcoal">
          Check your email
        </h2>
        <p className="mt-2 text-sm text-charcoal-mid">
          We&rsquo;ve sent a confirmation link to{' '}
          <strong className="text-charcoal break-all">
            {form.getValues('email')}
          </strong>
          . Open it on this device to finish creating your account.
        </p>
        <button
          type="button"
          onClick={onSwitchToSignIn}
          className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-cream-deep bg-white px-5 text-sm font-bold text-charcoal hover:bg-cream"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div
      id="auth-pane-register"
      role="tabpanel"
      aria-labelledby="register-heading"
      className="mt-6"
    >
      <h2
        id="register-heading"
        className="font-display text-2xl font-black tracking-tight text-charcoal"
      >
        Create your FeastPot account
      </h2>
      <p className="mt-1 text-sm text-charcoal-mid">
        Save addresses, earn FeastPoints and reorder favourites in one tap.
      </p>

      {serverError && (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-scotch/10 px-3 py-2.5 text-sm font-medium text-scotch"
        >
          {serverError}
        </div>
      )}

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mt-5 space-y-3.5"
        noValidate
      >
        <TextField
          id="reg-fullName"
          label="Full name"
          autoComplete="name"
          placeholder="e.g. Amara Okafor"
          error={fieldError('fullName')}
          {...form.register('fullName')}
        />
        <TextField
          id="reg-email"
          type="email"
          label="Email address"
          autoComplete="email"
          placeholder="you@email.com"
          error={fieldError('email')}
          {...form.register('email')}
        />
        <TextField
          id="reg-phone"
          type="tel"
          label="Phone number"
          autoComplete="tel"
          placeholder="07XXX XXX XXX"
          error={fieldError('phone')}
          {...form.register('phone')}
        />
        <PasswordField
          id="reg-password"
          label="Password"
          autoComplete="new-password"
          placeholder="Create a strong password"
          show={showPwd}
          onToggle={() => setShowPwd((v) => !v)}
          error={fieldError('password')}
          {...form.register('password')}
        />
        <PasswordField
          id="reg-confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Confirm your password"
          show={showCpwd}
          onToggle={() => setShowCpwd((v) => !v)}
          error={fieldError('confirmPassword')}
          {...form.register('confirmPassword')}
        />
        <TextField
          id="reg-postcode"
          label="Postcode / service area"
          autoComplete="postal-code"
          placeholder="e.g. SW1A 1AA"
          error={fieldError('postcode')}
          {...form.register('postcode')}
        />

        <label className="flex cursor-pointer items-start gap-2.5 pt-1">
          <input
            type="checkbox"
            {...form.register('marketingOptIn')}
            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-cream-deep accent-brand"
          />
          <span className="text-[13px] leading-snug text-charcoal-mid">
            Send me offers, updates and recommendations
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            {...form.register('termsAccepted')}
            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-cream-deep accent-brand"
          />
          <span className="text-[13px] leading-snug text-charcoal-mid">
            I agree to the{' '}
            <Link
              href="/legal/terms"
              className="font-semibold text-brand hover:underline"
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href="/legal/privacy"
              className="font-semibold text-brand hover:underline"
            >
              Privacy Policy
            </Link>
          </span>
        </label>
        {fieldError('termsAccepted') && (
          <p className="text-xs font-medium text-scotch">
            {fieldError('termsAccepted')}
          </p>
        )}

        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-4 py-3.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {form.formState.isSubmitting
            ? 'Creating account…'
            : 'Create account'}
        </button>

        <div className="flex items-center gap-3 pt-2">
          <span className="h-px flex-1 bg-cream-deep" />
          <span className="text-xs font-medium text-charcoal-mid">
            or sign up with
          </span>
          <span className="h-px flex-1 bg-cream-deep" />
        </div>

        <button
          type="button"
          onClick={() => handleOAuth('google')}
          className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-cream-deep bg-white py-3 text-sm font-semibold text-charcoal hover:bg-cream"
        >
          <GoogleLogo className="h-4 w-4" /> Continue with Google
        </button>
        <button
          type="button"
          onClick={() => handleOAuth('apple')}
          className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-cream-deep bg-white py-3 text-sm font-semibold text-charcoal hover:bg-cream"
        >
          <AppleLogo className="h-4 w-4" /> Continue with Apple
        </button>

        <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-xs text-charcoal-mid">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Your information is secure and never shared.
        </p>

        <p className="pt-1 text-center text-sm text-charcoal-mid">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToSignIn}
            className="font-bold text-brand hover:underline"
          >
            Sign in
          </button>
        </p>
      </form>
    </div>
  );
}

// ── Shared inputs ───────────────────────────────────────────────────────
type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
};

const TextField = function TextFieldImpl({
  id,
  label,
  error,
  className,
  ...rest
}: TextFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-semibold text-charcoal"
      >
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-lg border bg-white px-3.5 py-3 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/60 focus:outline-none focus:ring-2 focus:ring-brand/20 ${
          error
            ? 'border-scotch focus:border-scotch'
            : 'border-cream-deep focus:border-brand'
        } ${className ?? ''}`}
        {...rest}
      />
      {error && (
        <p className="mt-1 text-xs font-medium text-scotch">{error}</p>
      )}
    </div>
  );
};

type PasswordFieldProps = TextFieldProps & {
  show: boolean;
  onToggle: () => void;
};
function PasswordField({
  id,
  label,
  error,
  show,
  onToggle,
  className,
  ...rest
}: PasswordFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-semibold text-charcoal"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className={`w-full rounded-lg border bg-white px-3.5 py-3 pr-11 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/60 focus:outline-none focus:ring-2 focus:ring-brand/20 ${
            error
              ? 'border-scotch focus:border-scotch'
              : 'border-cream-deep focus:border-brand'
          } ${className ?? ''}`}
          {...rest}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-charcoal-mid hover:text-charcoal"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <p className="mt-1 text-xs font-medium text-scotch">{error}</p>
      )}
    </div>
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden role="presentation">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44c11 0 20-8 20-20 0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4 5.5l6.3 5.3C41 35.5 44 30.2 44 24c0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden role="presentation">
      <path
        fill="currentColor"
        d="M16.4 12.7c0-2.7 2.2-4 2.3-4.1-1.3-1.8-3.2-2.1-3.9-2.1-1.7-.2-3.3 1-4.1 1-.9 0-2.2-1-3.6-1-1.8 0-3.6 1.1-4.5 2.7-1.9 3.3-.5 8.3 1.4 11 .9 1.3 2 2.8 3.4 2.8s1.9-.9 3.6-.9 2.2.9 3.6.9 2.5-1.3 3.5-2.7c1.1-1.5 1.5-3 1.5-3.1-.1 0-2.9-1.1-2.9-4.5zM13.7 4.8c.7-.9 1.2-2.1 1.1-3.3-1.1.1-2.4.7-3.1 1.6-.7.8-1.3 2-1.1 3.2 1.2.1 2.4-.6 3.1-1.5z"
      />
    </svg>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <AuthShell />
    </Suspense>
  );
}

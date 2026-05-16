'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { RegisterSchema, type RegisterDto } from '@feastpot/types';
import { Check, Eye, EyeOff, Lock } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/client';

/**
 * Why-join bullets shown in the left card. Edit text here, not in JSX.
 */
const WHY_JOIN = [
  'Save addresses for faster checkout',
  'Reorder your favourites in one tap',
  'Earn FeastPoints on every order',
  'Invite friends and earn rewards',
  'Access member-only offers & perks',
];

/**
 * The wireframe shows a single "Full name" field, but RegisterSchema (and
 * the API mirror route) require firstName + lastName separately. We expose
 * a UI-only superset schema with fullName + postcode + confirmPassword +
 * termsAccepted, then split & strip on submit so the API contract stays
 * unchanged. Postcode is captured into user_metadata only — there's no
 * column for it yet on public.users.
 */
const FormSchema = RegisterSchema.omit({ firstName: true, lastName: true })
  .extend({
    // 200-char cap so the post-split firstName/lastName both fit inside
    // the backend's RegisterSchema max(100) — see splitName() below.
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
    // Boolean + refine instead of z.literal(true) so RHF's `false`
    // default is type-sound (no `as unknown as true` escape hatch).
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

type FormValues = z.infer<typeof FormSchema>;

/** Split "Amara Grace Okafor" → { first: "Amara Grace", last: "Okafor" }. */
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  const last = parts.pop() ?? '';
  return { firstName: parts.join(' ') || last, lastName: last };
}

export default function CreateAccountPage() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [showCpwd, setShowCpwd] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
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
  // the email-confirmation round-trip. Clear nothing here — /auth/callback
  // does the cleanup once the user actually confirms.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('feastpot.referral.v1');
      if (stored) form.setValue('referralCode', stored);
    } catch {
      /* localStorage unavailable */
    }
  }, [form]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const supabase = createClient();
    const { firstName, lastName } = splitName(values.fullName);
    const phone = values.phone?.trim() || undefined;
    const postcode = values.postcode.toUpperCase().trim();

    // Step 1: create the Supabase Auth user (sends confirmation email).
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

    // Step 2: best-effort sync to our own users table. Skipped if Supabase
    // didn't return a session yet (typical for "confirm email" flows) — the
    // /auth/callback route handler will sync once the user clicks the link.
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
        // BACKEND GAP: /v1/users/sync may not be live in every env. Don't
        // fail the signup just because the mirror route is missing — the
        // user is authenticated and we can backfill later.
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

  if (submitted) {
    return (
      <CenterShell>
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-card">
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">
            Check your email
          </h1>
          <p className="mt-2 text-sm text-charcoal-mid">
            We&rsquo;ve sent a confirmation link to{' '}
            <strong className="text-charcoal">
              {form.getValues('email')}
            </strong>
            . Open it on this device to finish creating your account.
          </p>
          <Link
            href="/sign-in"
            className="mt-6 inline-block rounded-xl border border-cream-deep bg-white px-5 py-2.5 text-sm font-bold text-charcoal hover:bg-cream"
          >
            Back to sign in
          </Link>
        </div>
      </CenterShell>
    );
  }

  const fieldError = (k: keyof FormValues) =>
    form.formState.errors[k]?.message as string | undefined;

  return (
    <CenterShell>
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-card lg:grid lg:grid-cols-[320px_1fr]">
        {/* LEFT — Why join */}
        <aside className="flex flex-col justify-center border-b border-cream-deep p-8 lg:border-b-0 lg:border-r">
          <h2 className="font-display text-2xl font-black tracking-tight text-charcoal">
            Join FeastPot today
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-charcoal-mid">
            Create your account and unlock a world of flavour, perks and
            convenience.
          </p>

          <div className="mt-6 rounded-2xl bg-brand-light p-5">
            <p className="font-display text-sm font-black text-charcoal">
              Why join FeastPot
            </p>
            <ul className="mt-3 space-y-2.5">
              {WHY_JOIN.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check
                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand"
                    strokeWidth={3}
                    aria-hidden
                  />
                  <span className="text-[13px] leading-snug text-charcoal">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-5 flex items-center gap-1.5 text-xs text-charcoal-mid">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Your information is secure and never shared.
          </p>
        </aside>

        {/* RIGHT — form */}
        <div className="p-7 sm:p-9">
          {serverError && (
            <div
              role="alert"
              className="mb-4 rounded-lg bg-scotch/10 px-3 py-2.5 text-sm font-medium text-scotch"
            >
              {serverError}
            </div>
          )}

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-3.5"
            noValidate
          >
            <TextField
              id="fullName"
              label="Full name"
              autoComplete="name"
              placeholder="e.g. Amara Okafor"
              error={fieldError('fullName')}
              {...form.register('fullName')}
            />
            <TextField
              id="email"
              type="email"
              label="Email address"
              autoComplete="email"
              placeholder="you@example.com"
              error={fieldError('email')}
              {...form.register('email')}
            />
            <TextField
              id="phone"
              type="tel"
              label="Phone number"
              autoComplete="tel"
              placeholder="07XXX XXX XXX"
              error={fieldError('phone')}
              {...form.register('phone')}
            />

            <PasswordField
              id="password"
              label="Password"
              autoComplete="new-password"
              placeholder="Create a strong password"
              show={showPwd}
              onToggle={() => setShowPwd((v) => !v)}
              error={fieldError('password')}
              {...form.register('password')}
            />
            <PasswordField
              id="confirmPassword"
              label="Confirm password"
              autoComplete="new-password"
              placeholder="Confirm your password"
              show={showCpwd}
              onToggle={() => setShowCpwd((v) => !v)}
              error={fieldError('confirmPassword')}
              {...form.register('confirmPassword')}
            />
            <TextField
              id="postcode"
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
              className="mt-2 w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {form.formState.isSubmitting
                ? 'Creating account…'
                : 'Create Account'}
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
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-cream-deep bg-white py-3 text-sm font-semibold text-charcoal hover:bg-cream"
            >
              <GoogleLogo className="h-4 w-4" /> Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuth('apple')}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-cream-deep bg-white py-3 text-sm font-semibold text-charcoal hover:bg-cream"
            >
              <AppleLogo className="h-4 w-4" /> Continue with Apple
            </button>

            <p className="pt-2 text-center text-sm text-charcoal-mid">
              Already have an account?{' '}
              <Link
                href="/sign-in"
                className="font-bold text-brand hover:underline"
              >
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </CenterShell>
  );
}

/**
 * Centered cream-background shell. Deliberately bypasses the customer
 * PWA's TopNav/BottomNav so the marketing card sits on a clean canvas
 * with just the logo above it, exactly like the wireframe.
 */
function CenterShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream-warm px-4 py-10 sm:px-6">
      <Link
        href="/"
        aria-label="Feastpot home"
        className="mb-7 inline-flex items-center"
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
      {children}
    </div>
  );
}

type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
};
const TextField = Object.assign(
  // forwardRef-light wrapper: react-hook-form's register() spreads name/ref/etc.
  function TextFieldImpl({ id, label, error, className, ...rest }: TextFieldProps) {
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
  },
  { displayName: 'TextField' },
);

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
          className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-mid hover:text-charcoal"
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

/**
 * Brand-locked Google "G" logo. Inline SVG so we don't ship another asset
 * just for the SSO button and stay clear of Google's hosted-image CDN rate
 * limits in dev. Colours match Google's brand guidelines.
 */
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

/** Apple wordmark/glyph in pure black per Apple's HIG. */
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

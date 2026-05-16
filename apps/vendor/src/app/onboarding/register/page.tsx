'use client';

import { Check, Clock } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { ApiError, apiRequest } from '@/lib/api/client';

/**
 * Vendor self-serve "Register interest" form — Image 2, panel 2.
 *
 * Per the solutions-architect note in the spec: this is a real signup,
 * not a manual invite list. On submit we POST to
 * `/v1/vendors/register-interest` which is expected to create a Vendor
 * with status:'pending' (or a VendorApplication row) for admin review.
 * The endpoint may not be live in every environment yet — we treat a
 * 404 as a graceful "we got it, we'll be in touch" so the marketing
 * funnel doesn't break before backend wiring lands.
 */

const CUISINES = [
  'Nigerian',
  'Ghanaian',
  'Jamaican',
  'Caribbean',
  'Congolese',
  'Somali',
  'Ethiopian',
  'West African',
  'Other',
];

const KITCHEN_TYPES = ['Home cook', 'Caterer', 'Restaurant'] as const;
type KitchenType = (typeof KITCHEN_TYPES)[number];

const BENEFITS = [
  'Reach customers near you',
  'Set your delivery radius',
  'Get paid every week',
];

const STEPS = [
  { n: 1, label: 'Apply', sub: 'Tell us about you and your kitchen' },
  {
    n: 2,
    label: 'Quick review',
    sub: "We'll review your details within 1–2 days",
  },
  { n: 3, label: 'Menu setup', sub: 'Add your dishes and set your prices' },
  {
    n: 4,
    label: 'Start receiving orders',
    sub: 'Go live and get your first orders',
  },
];

type FieldErrors = Partial<Record<string, string>>;

export default function VendorRegisterInterestPage() {
  const [form, setForm] = useState({
    fullName: '',
    kitchenName: '',
    email: '',
    phone: '',
    postcode: '',
    cuisineType: '',
    kitchenType: 'Home cook' as KitchenType,
    instagram: '',
    foodStory: '',
    hasFSA: '' as '' | 'yes' | 'no',
    termsAccepted: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.fullName.trim()) e.fullName = 'Required';
    if (!form.kitchenName.trim()) e.kitchenName = 'Required';
    if (!form.email.includes('@')) e.email = 'Enter a valid email';
    if (form.phone.replace(/\D/g, '').length < 10)
      e.phone = 'Enter a valid phone number';
    if (!form.postcode.trim()) e.postcode = 'Required';
    if (!form.cuisineType) e.cuisineType = 'Select a cuisine';
    if (!form.foodStory.trim())
      e.foodStory = 'Tell us a little about your food';
    if (!form.hasFSA) e.hasFSA = 'Please answer this question';
    if (!form.termsAccepted)
      e.termsAccepted = 'You must accept the Terms and Privacy Policy';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await apiRequest('/vendors/register-interest', {
        method: 'POST',
        body: {
          fullName: form.fullName.trim(),
          kitchenName: form.kitchenName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          postcode: form.postcode.toUpperCase().trim(),
          cuisineType: form.cuisineType,
          kitchenType: form.kitchenType,
          instagram: form.instagram.trim().replace(/^@/, '') || undefined,
          foodStory: form.foodStory.trim(),
          hasFoodHygieneRegistration: form.hasFSA === 'yes',
          marketingConsent: true,
        },
      });
      setSubmitted(true);
    } catch (e) {
      // BACKEND GAP: /v1/vendors/register-interest may not be live in every
      // env yet. Architect review (correctly) flagged silent soft-success
      // as data-loss — show an honest error with a mailto fallback so the
      // lead actually reaches us. Also stash to localStorage so support
      // can recover the payload from the user's browser if needed.
      if (e instanceof ApiError && e.status === 404) {
        try {
          const key = `feastpot.vendor-application.${Date.now()}`;
          window.localStorage.setItem(key, JSON.stringify(form));
        } catch {
          /* localStorage unavailable — nothing more we can do */
        }
        setServerError(
          "We're not quite ready to take applications online yet. Please email your details to hello@feastpot.co.uk and we'll get straight back to you.",
        );
      } else if (e instanceof ApiError) {
        setServerError(e.message);
      } else {
        setServerError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-3xl bg-white p-10 text-center shadow-card">
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-light"
            aria-hidden
          >
            <Check className="h-7 w-7 text-brand" strokeWidth={3} />
          </div>
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">
            Thanks — we&rsquo;ve got it
          </h1>
          <p className="mt-2 text-sm text-charcoal-mid">
            Our team will review your details and get back to you within 1–2
            business days at{' '}
            <strong className="text-charcoal">{form.email}</strong>.
          </p>
          <Link
            href="/sign-in"
            className="mt-7 inline-block rounded-xl border border-cream-deep bg-white px-5 py-2.5 text-sm font-bold text-charcoal hover:bg-cream"
          >
            Back to vendor sign in
          </Link>
        </div>
      </Shell>
    );
  }

  const inputClass = (key: string) =>
    `w-full rounded-lg border bg-white px-3.5 py-3 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/60 focus:outline-none focus:ring-2 focus:ring-brand/20 ${
      errors[key]
        ? 'border-scotch focus:border-scotch'
        : 'border-cream-deep focus:border-brand'
    }`;

  return (
    <Shell>
      <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-card lg:grid lg:grid-cols-[360px_1fr]">
        {/* LEFT — value prop + 4-step diagram */}
        <aside className="border-b border-cream-deep p-8 lg:border-b-0 lg:border-r">
          <h2 className="font-display text-2xl font-black tracking-tight text-charcoal">
            Join FeastPot
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-charcoal-mid">
            Apply in a few minutes. Our team reviews every application and
            comes back to you fast.
          </p>

          <ul className="mt-6 space-y-2.5">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-light"
                  aria-hidden
                >
                  <Check
                    className="h-3 w-3 text-brand"
                    strokeWidth={3}
                  />
                </span>
                <span className="text-[13px] leading-snug text-charcoal">
                  {b}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <p className="font-display text-sm font-black text-charcoal">
              Your onboarding journey
            </p>
            <ol className="mt-3 space-y-3">
              {STEPS.map((s) => (
                <li key={s.n} className="flex items-start gap-3">
                  <span
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand font-display text-xs font-black text-white"
                    aria-hidden
                  >
                    {s.n}
                  </span>
                  <div>
                    <div className="text-[13px] font-bold text-charcoal">
                      {s.label}
                    </div>
                    <div className="text-[12px] text-charcoal-mid">
                      {s.sub}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        {/* RIGHT — form */}
        <form onSubmit={handleSubmit} className="p-7 sm:p-9" noValidate>
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">
            Register your interest
          </h1>
          <p className="mt-1 text-sm text-charcoal-mid">
            Fill in the basics — you can polish your menu later.
          </p>

          {serverError && (
            <div
              role="alert"
              className="mt-5 rounded-lg bg-scotch/10 px-3 py-2.5 text-sm font-medium text-scotch"
            >
              {serverError}
            </div>
          )}

          <div className="mt-6 space-y-3.5">
            <Field
              id="fullName"
              label="Full name"
              error={errors.fullName}
              value={form.fullName}
              onChange={(v) => setForm((f) => ({ ...f, fullName: v }))}
              placeholder="e.g. Amara Okafor"
              autoComplete="name"
              className={inputClass('fullName')}
            />
            <Field
              id="kitchenName"
              label="Kitchen / business name"
              error={errors.kitchenName}
              value={form.kitchenName}
              onChange={(v) => setForm((f) => ({ ...f, kitchenName: v }))}
              placeholder="e.g. Mama Amara's Kitchen"
              className={inputClass('kitchenName')}
            />
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                id="email"
                type="email"
                label="Email address"
                error={errors.email}
                value={form.email}
                onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                placeholder="you@example.com"
                autoComplete="email"
                className={inputClass('email')}
              />
              <Field
                id="phone"
                type="tel"
                label="Phone / WhatsApp"
                error={errors.phone}
                value={form.phone}
                onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                placeholder="07XXX XXX XXX"
                autoComplete="tel"
                className={inputClass('phone')}
              />
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                id="postcode"
                label="Postcode / service area"
                error={errors.postcode}
                value={form.postcode}
                onChange={(v) => setForm((f) => ({ ...f, postcode: v }))}
                placeholder="e.g. SW1A 1AA"
                autoComplete="postal-code"
                className={inputClass('postcode')}
              />
              <div>
                <label
                  htmlFor="cuisineType"
                  className="mb-1.5 block text-[13px] font-semibold text-charcoal"
                >
                  Cuisine type
                </label>
                <select
                  id="cuisineType"
                  value={form.cuisineType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cuisineType: e.target.value }))
                  }
                  className={inputClass('cuisineType')}
                >
                  <option value="">Select cuisine</option>
                  {CUISINES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {errors.cuisineType && (
                  <p className="mt-1 text-xs font-medium text-scotch">
                    {errors.cuisineType}
                  </p>
                )}
              </div>
            </div>

            {/* Kitchen type — segmented control */}
            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-charcoal">
                Kitchen type
              </span>
              <div
                role="radiogroup"
                aria-label="Kitchen type"
                className="grid grid-cols-3 gap-2 rounded-lg bg-cream p-1"
              >
                {KITCHEN_TYPES.map((k) => {
                  const active = form.kitchenType === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() =>
                        setForm((f) => ({ ...f, kitchenType: k }))
                      }
                      className={`rounded-md py-2 text-[13px] font-semibold transition-colors ${
                        active
                          ? 'bg-white text-brand shadow-card'
                          : 'text-charcoal-mid hover:text-charcoal'
                      }`}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
            </div>

            <Field
              id="instagram"
              label="Instagram handle (optional)"
              value={form.instagram}
              onChange={(v) => setForm((f) => ({ ...f, instagram: v }))}
              placeholder="@yourhandle"
              className={inputClass('instagram')}
            />

            <div>
              <label
                htmlFor="foodStory"
                className="mb-1.5 block text-[13px] font-semibold text-charcoal"
              >
                Tell us about your food
              </label>
              <textarea
                id="foodStory"
                rows={4}
                value={form.foodStory}
                onChange={(e) =>
                  setForm((f) => ({ ...f, foodStory: e.target.value }))
                }
                placeholder="What do you cook? What makes it special?"
                className={inputClass('foodStory')}
              />
              {errors.foodStory && (
                <p className="mt-1 text-xs font-medium text-scotch">
                  {errors.foodStory}
                </p>
              )}
            </div>

            {/* FSA Yes/No */}
            <fieldset>
              <legend className="mb-1.5 block text-[13px] font-semibold text-charcoal">
                Do you have food registration / hygiene details?
              </legend>
              <div
                role="radiogroup"
                aria-label="Food registration or hygiene details"
                className="flex gap-2"
              >
                {(['yes', 'no'] as const).map((v) => {
                  const active = form.hasFSA === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setForm((f) => ({ ...f, hasFSA: v }))}
                      className={`flex-1 rounded-lg border py-2.5 text-[13px] font-semibold capitalize transition-colors ${
                        active
                          ? 'border-brand bg-brand-light text-brand'
                          : 'border-cream-deep bg-white text-charcoal-mid hover:border-charcoal-mid'
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
              {errors.hasFSA && (
                <p className="mt-1 text-xs font-medium text-scotch">
                  {errors.hasFSA}
                </p>
              )}
            </fieldset>

            {/* Terms */}
            <label className="flex cursor-pointer items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                checked={form.termsAccepted}
                onChange={(e) =>
                  setForm((f) => ({ ...f, termsAccepted: e.target.checked }))
                }
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
            {errors.termsAccepted && (
              <p className="text-xs font-medium text-scotch">
                {errors.termsAccepted}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-3 w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit interest'}
            </button>

            <p className="flex items-center justify-center gap-1.5 pt-1 text-xs font-medium text-charcoal-mid">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              We&rsquo;ll contact you within 1–2 business days.
            </p>

            <p className="pt-2 text-center text-sm text-charcoal-mid">
              Already a vendor?{' '}
              <Link
                href="/sign-in"
                className="font-bold text-brand hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-cream-warm px-4 py-10 sm:px-6">
      <Link
        href="/"
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
      {children}
    </div>
  );
}

type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  className: string;
};
function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  placeholder,
  autoComplete,
  className,
}: FieldProps) {
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
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
      {error && (
        <p className="mt-1 text-xs font-medium text-scotch">{error}</p>
      )}
    </div>
  );
}

'use client';

import {
  BadgeCheck,
  CalendarClock,
  Check,
  ChefHat,
  CreditCard,
  Loader2,
  MapPin,
  PoundSterling,
  Settings,
  ShieldCheck,
  Star,
  TriangleAlert,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { forwardRef, useRef, useState } from 'react';

import { apiRequest, ApiError } from '@/lib/api/client';

/**
 * Vendor acquisition landing - feastpot.co.uk/become-a-vendor.
 *
 * Lives entirely on the customer PWA. Anyone can find it; submitting the
 * interest form hits POST /v1/vendors/register-interest and writes to
 * `vendor_applications`. No redirect to the vendor portal ever happens
 * from this page - the portal URL only exists in the approval email sent
 * after admin review.
 *
 * Two states render at the same URL: a marketing landing (default) and an
 * inline interest form (revealed when any "Register interest" CTA is
 * clicked). No client routing - `showForm` is local state and we smooth-
 * scroll the form into view so the marketing copy stays as context above it.
 */

// ── Constants (rendered into the form & marketing sections) ─────────────

// Friendly labels paired with the API enum values. Keep the order matching
// what the form Select offers so the highlighted-default sits first.
const KITCHEN_TYPES: { value: 'home' | 'commercial' | 'pop-up' | 'other'; label: string }[] = [
  { value: 'home', label: 'Home kitchen' },
  { value: 'commercial', label: 'Commercial / restaurant kitchen' },
  { value: 'pop-up', label: 'Pop-up / event caterer' },
  { value: 'other', label: 'Other' },
];

const CUISINE_OPTIONS = [
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

const BENEFITS = [
  {
    Icon: PoundSterling,
    label: 'No upfront cost',
    sub: "Join free and start when you're ready.",
  },
  {
    Icon: MapPin,
    label: 'Orders in your area',
    sub: 'We connect you with hungry customers nearby.',
  },
  {
    Icon: CalendarClock,
    label: 'Paid weekly',
    sub: 'Reliable weekly payouts direct to your account.',
  },
  {
    Icon: Settings,
    label: 'We handle the boring stuff',
    sub: 'Marketing, payments and customer support.',
  },
];

const STEPS = [
  { n: 1, label: 'Apply', sub: 'Tell us about you and your kitchen' },
  {
    n: 2,
    label: 'Quick review',
    sub: "We'll review your details within 1–2 business days",
  },
  { n: 3, label: 'Menu setup', sub: 'Add your dishes and set your prices' },
  {
    n: 4,
    label: 'Start receiving orders',
    sub: 'Go live and get your first orders',
  },
];

const TRUST = [
  {
    Icon: ShieldCheck,
    label: 'FSA ready',
    sub: 'Food safety first. We follow UK standards.',
  },
  {
    Icon: Users,
    label: 'Growing network of cooks',
    sub: '500+ cooks and caterers already joined.',
  },
  {
    Icon: BadgeCheck,
    label: 'London launch',
    sub: 'Proudly launching across London.',
  },
];

const SOCIAL_PROOF = [
  { Icon: Users, value: '500+', label: 'Cooks joined' },
  { Icon: Star, value: '4.8 / 5', label: 'Vendor satisfaction' },
  { Icon: CreditCard, value: 'Weekly payouts', label: 'On time, every time' },
];

// ── Form types ──────────────────────────────────────────────────────────

type KitchenType = (typeof KITCHEN_TYPES)[number]['value'];

interface FormState {
  fullName: string;
  kitchenName: string;
  email: string;
  phone: string;
  postcode: string;
  cuisineType: string;
  kitchenType: KitchenType;
  instagram: string;
  foodStory: string;
  hasFSA: '' | 'yes' | 'no';
  marketingConsent: boolean;
  terms: boolean;
}

const INITIAL_FORM: FormState = {
  fullName: '',
  kitchenName: '',
  email: '',
  phone: '',
  postcode: '',
  cuisineType: '',
  kitchenType: 'home',
  instagram: '',
  foodStory: '',
  hasFSA: '',
  marketingConsent: true,
  terms: false,
};

// API DTO shape (mirrors apps/api/src/modules/vendors/dto/register-vendor-interest.dto.ts).
interface RegisterInterestPayload {
  fullName: string;
  kitchenName: string;
  email: string;
  phone: string;
  postcode: string;
  cuisineType: string;
  kitchenType: KitchenType;
  hasFoodHygieneRegistration: boolean;
  foodStory: string;
  instagram?: string;
  marketingConsent?: boolean;
}

// ── Page ────────────────────────────────────────────────────────────────

export default function BecomeAVendorPage() {
  const formRef = useRef<HTMLElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedSnapshot, setSubmittedSnapshot] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const openForm = () => {
    setShowForm(true);
    // Wait for the form to mount before scrolling - `requestAnimationFrame`
    // gives React a paint cycle. `setTimeout` fallback covers slow paints.
    requestAnimationFrame(() => {
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
    });
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (form.fullName.trim().length < 2) e.fullName = 'Enter your full name';
    if (form.kitchenName.trim().length < 2) e.kitchenName = 'Enter your kitchen or business name';
    if (!form.email.includes('@')) e.email = 'Enter a valid email';
    // Phone: backend requires raw length 7–40. We count digits for the
    // floor (so "07" prefixes pass) but cap the raw string to match.
    if (form.phone.replace(/\D/g, '').length < 7) e.phone = 'Enter a valid phone number';
    else if (form.phone.length > 40) e.phone = 'Phone number is too long';
    if (form.postcode.trim().length < 2) e.postcode = 'Enter your postcode';
    else if (form.postcode.trim().length > 16) e.postcode = 'Postcode is too long';
    if (!form.cuisineType) e.cuisineType = 'Select a cuisine type';
    if (form.foodStory.trim().length < 20)
      e.foodStory = 'Tell us a little more (min 20 characters)';
    if (!form.hasFSA) e.hasFSA = 'Please answer this question';
    if (!form.terms) e.terms = 'You must accept the terms to continue';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setServerError(null);
    if (!validate()) return;

    const payload: RegisterInterestPayload = {
      fullName: form.fullName.trim(),
      kitchenName: form.kitchenName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      postcode: form.postcode.trim().toUpperCase(),
      cuisineType: form.cuisineType,
      kitchenType: form.kitchenType,
      hasFoodHygieneRegistration: form.hasFSA === 'yes',
      foodStory: form.foodStory.trim(),
      ...(form.instagram.trim() ? { instagram: form.instagram.trim() } : {}),
      marketingConsent: form.marketingConsent,
    };

    setSubmitting(true);
    try {
      await apiRequest('/vendors/register-interest', { method: 'POST', body: payload });
      setSubmittedSnapshot(form);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message || 'Something went wrong. Please try again.'
          : 'Could not submit - check your connection and try again.';
      setServerError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted && submittedSnapshot) {
    return <SuccessPanel snapshot={submittedSnapshot} />;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Marketing top-nav (lightweight - the customer site's persistent nav
          is hidden on this route to give the acquisition page its own air). */}
      <nav className="sticky top-0 z-40 border-b border-cream-deep bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8 lg:px-12">
          <Link href="/" aria-label="Feastpot home" className="inline-flex">
            <Image
              src="/images/feastpot-logo.png"
              alt="Feastpot"
              width={317}
              height={100}
              className="h-8 w-auto sm:h-9"
              priority
            />
          </Link>
          <div className="hidden items-center gap-7 lg:flex">
            <a
              href="#how-it-works"
              className="text-sm font-semibold text-charcoal hover:text-brand"
            >
              How it works
            </a>
            <a href="#benefits" className="text-sm font-semibold text-charcoal hover:text-brand">
              Benefits
            </a>
          </div>
          <button
            type="button"
            onClick={openForm}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark sm:px-5 sm:py-2.5"
          >
            Register interest
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-2 lg:gap-12 lg:px-12 lg:py-16">
        <div>
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-brand">
            Join FeastPot · For home cooks
          </p>
          <h1 className="font-display text-4xl font-black leading-[1.1] tracking-tight text-charcoal sm:text-5xl lg:text-[56px]">
            Turn your cooking
            <br />
            <span className="text-brand">into weekly income</span>
          </h1>
          <div className="mt-4 h-[3px] w-16 rounded-full bg-plantain" aria-hidden />
          <p className="mt-5 max-w-xl text-base leading-relaxed text-charcoal-mid">
            Get paid to cook from home without building a website, chasing customers, or
            dealing with admin. We bring the orders, you focus on the food.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={openForm}
              className="inline-flex items-center justify-center rounded-xl bg-brand px-7 py-3.5 text-sm font-bold text-white shadow-card hover:bg-brand-dark"
            >
              Register interest
            </button>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center rounded-xl border-2 border-charcoal bg-white px-7 py-3.5 text-sm font-bold text-charcoal hover:bg-cream"
            >
              See how it works
            </a>
          </div>
        </div>

        {/* Hero visual */}
        <div className="relative mx-auto aspect-[10/9] w-full max-w-[440px] overflow-hidden rounded-3xl bg-cream-warm shadow-[0_12px_48px_rgba(0,0,0,0.15)] lg:max-w-none">
          <Image
            src="/images/auth-hero-food.png"
            alt="A spread of African and Caribbean dishes a Feastpot cook might serve"
            fill
            sizes="(max-width: 1024px) 440px, 540px"
            className="object-cover"
            priority
          />
          <div className="absolute bottom-5 left-5 flex items-center gap-2.5 rounded-xl bg-white/95 px-3.5 py-2.5 shadow-card backdrop-blur">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-light"
              aria-hidden
            >
              <ChefHat className="h-4 w-4 text-brand" />
            </span>
            <div>
              <div className="text-[13px] font-black text-charcoal">
                You cook. We do the rest.
              </div>
              <div className="text-[11px] font-medium text-charcoal-mid">
                Orders, payments, support
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section
        id="benefits"
        className="mx-auto grid max-w-6xl gap-4 px-5 pb-14 sm:px-8 lg:grid-cols-4 lg:px-12"
      >
        {BENEFITS.map(({ Icon, label, sub }) => (
          <div key={label} className="rounded-2xl bg-cream-warm p-5">
            <span
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light"
              aria-hidden
            >
              <Icon className="h-5 w-5 text-brand" />
            </span>
            <div className="font-display text-[15px] font-black text-charcoal">{label}</div>
            <p className="mt-1.5 text-[13px] leading-snug text-charcoal-mid">{sub}</p>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-cream-warm py-14">
        <div className="mx-auto max-w-5xl px-5 text-center sm:px-8 lg:px-12">
          <h2 className="font-display text-3xl font-black tracking-tight text-charcoal">
            Your onboarding journey
          </h2>
          <p className="mt-2 text-sm font-medium text-charcoal-mid">
            Four simple steps to start earning
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl bg-white p-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <div
                  className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand font-display text-base font-black text-white"
                  aria-hidden
                >
                  {s.n}
                </div>
                <div className="font-display text-[15px] font-black text-charcoal">
                  {s.label}
                </div>
                <p className="mt-1.5 text-[13px] leading-snug text-charcoal-mid">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust strips */}
      <section className="mx-auto grid max-w-6xl gap-4 px-5 pt-12 sm:grid-cols-3 sm:px-8 lg:px-12">
        {TRUST.map(({ Icon, label, sub }) => (
          <div
            key={label}
            className="flex items-start gap-3.5 rounded-2xl bg-cream-warm p-5"
          >
            <span
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand-light"
              aria-hidden
            >
              <Icon className="h-5 w-5 text-brand" />
            </span>
            <div>
              <div className="font-display text-[15px] font-black text-charcoal">{label}</div>
              <p className="mt-1 text-[13px] leading-snug text-charcoal-mid">{sub}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Social proof */}
      <section className="mx-auto mt-8 grid max-w-6xl gap-6 border-t border-cream-deep px-5 py-8 sm:grid-cols-3 sm:px-8 lg:px-12">
        {SOCIAL_PROOF.map(({ Icon, value, label }) => (
          <div key={label} className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light"
              aria-hidden
            >
              <Icon className="h-5 w-5 text-brand" />
            </span>
            <div>
              <div className="font-display text-lg font-black text-charcoal">{value}</div>
              <div className="text-[13px] font-medium text-charcoal-mid">{label}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Final CTA - opens the form rather than linking out. */}
      {!showForm && (
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-2 text-center sm:px-8 lg:px-12">
          <button
            type="button"
            onClick={openForm}
            className="inline-flex items-center justify-center rounded-xl bg-brand px-8 py-4 text-sm font-bold text-white shadow-card hover:bg-brand-dark"
          >
            Register your interest
          </button>
          <p className="mt-3 text-xs font-medium text-charcoal-mid">
            We&rsquo;ll get back to you within 1–2 business days.
          </p>
        </section>
      )}

      {/* Inline interest form (rendered after click). */}
      {showForm && (
        <InterestForm
          ref={formRef}
          form={form}
          errors={errors}
          submitting={submitting}
          serverError={serverError}
          onUpdate={update}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

// ── Inline interest form ────────────────────────────────────────────────

interface InterestFormProps {
  form: FormState;
  errors: Partial<Record<keyof FormState, string>>;
  submitting: boolean;
  serverError: string | null;
  onUpdate: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onSubmit: (ev: React.FormEvent<HTMLFormElement>) => void;
}

const InterestForm = forwardRef<HTMLElement, InterestFormProps>(function InterestForm(
  { form, errors, submitting, serverError, onUpdate, onSubmit },
  ref,
) {
  return (
    <section
      ref={ref}
      aria-labelledby="interest-form-heading"
      className="mx-auto max-w-3xl px-5 pb-20 pt-8 sm:px-8 lg:px-12"
    >
      <div className="rounded-3xl border border-cream-deep bg-white p-6 shadow-card sm:p-8 lg:p-10">
        <h2
          id="interest-form-heading"
          className="font-display text-2xl font-black tracking-tight text-charcoal sm:text-3xl"
        >
          Tell us about your kitchen
        </h2>
        <p className="mt-2 text-sm font-medium text-charcoal-mid">
          Takes about 2 minutes. We&rsquo;ll be in touch within 1–2 business days.
        </p>

        <form noValidate onSubmit={onSubmit} className="mt-7 grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Your full name"
              id="fullName"
              value={form.fullName}
              onChange={(v) => onUpdate('fullName', v)}
              err={errors.fullName}
              autoComplete="name"
            />
            <Field
              label="Kitchen or business name"
              id="kitchenName"
              value={form.kitchenName}
              onChange={(v) => onUpdate('kitchenName', v)}
              err={errors.kitchenName}
              autoComplete="organization"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Email"
              id="email"
              type="email"
              value={form.email}
              onChange={(v) => onUpdate('email', v)}
              err={errors.email}
              autoComplete="email"
            />
            <Field
              label="Phone"
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(v) => onUpdate('phone', v)}
              err={errors.phone}
              autoComplete="tel"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Postcode"
              id="postcode"
              value={form.postcode}
              onChange={(v) => onUpdate('postcode', v.toUpperCase())}
              err={errors.postcode}
              autoComplete="postal-code"
            />
            <SelectField
              label="Cuisine type"
              id="cuisineType"
              value={form.cuisineType}
              onChange={(v) => onUpdate('cuisineType', v)}
              err={errors.cuisineType}
              placeholder="Select cuisine type"
              options={CUISINE_OPTIONS.map((c) => ({ value: c, label: c }))}
            />
          </div>

          <div>
            <span id="kitchenType-label" className="mb-2 block text-[13px] font-semibold text-charcoal">
              Kitchen type
            </span>
            <div
              role="radiogroup"
              aria-labelledby="kitchenType-label"
              className="flex flex-wrap gap-2"
            >
              {KITCHEN_TYPES.map((k) => {
                const active = form.kitchenType === k.value;
                return (
                  <button
                    key={k.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onUpdate('kitchenType', k.value)}
                    className={
                      'rounded-xl border px-4 py-2 text-[13px] font-semibold transition-colors ' +
                      (active
                        ? 'border-brand bg-brand text-white'
                        : 'border-cream-deep bg-white text-charcoal hover:border-brand/40')
                    }
                  >
                    {k.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Field
            label="Instagram / social handle"
            id="instagram"
            value={form.instagram}
            onChange={(v) => onUpdate('instagram', v)}
            optional
            placeholder="@yourkitchen"
          />

          <div>
            <label
              htmlFor="foodStory"
              className="mb-2 block text-[13px] font-semibold text-charcoal"
            >
              Tell us about your food
            </label>
            <textarea
              id="foodStory"
              rows={4}
              value={form.foodStory}
              onChange={(e) => onUpdate('foodStory', e.target.value)}
              placeholder="What do you cook? Who's it for? Anything that makes your kitchen special."
              className={
                'w-full rounded-xl border bg-white px-4 py-3 text-sm text-charcoal placeholder:text-charcoal-light focus:outline-none focus:ring-2 focus:ring-brand/40 ' +
                (errors.foodStory ? 'border-scotch' : 'border-cream-deep')
              }
            />
            {errors.foodStory && <ErrorText>{errors.foodStory}</ErrorText>}
          </div>

          <div>
            <span id="hasFSA-label" className="mb-2 block text-[13px] font-semibold text-charcoal">
              Do you have UK food hygiene registration?
            </span>
            <div role="radiogroup" aria-labelledby="hasFSA-label" className="flex gap-2">
              {(['yes', 'no'] as const).map((opt) => {
                const active = form.hasFSA === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onUpdate('hasFSA', opt)}
                    className={
                      'flex-1 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition-colors ' +
                      (active
                        ? 'border-brand bg-brand text-white'
                        : 'border-cream-deep bg-white text-charcoal hover:border-brand/40')
                    }
                  >
                    {opt === 'yes' ? 'Yes, registered' : 'Not yet'}
                  </button>
                );
              })}
            </div>
            {errors.hasFSA && <ErrorText>{errors.hasFSA}</ErrorText>}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-cream-warm p-3 text-[13px] font-medium text-charcoal-mid">
            <input
              type="checkbox"
              checked={form.marketingConsent}
              onChange={(e) => onUpdate('marketingConsent', e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span>Send me occasional tips and updates by email (optional).</span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 text-[13px] font-medium text-charcoal">
            <input
              type="checkbox"
              checked={form.terms}
              onChange={(e) => onUpdate('terms', e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span>
              I agree to the{' '}
              <Link href="/legal/vendor-terms" className="font-bold text-brand hover:underline">
                Vendor Terms
              </Link>{' '}
              and{' '}
              <Link href="/legal/privacy" className="font-bold text-brand hover:underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {errors.terms && <ErrorText>{errors.terms}</ErrorText>}

          {serverError && (
            <div className="flex items-start gap-2 rounded-xl border border-scotch/30 bg-scotch/5 p-3 text-[13px] font-medium text-scotch">
              <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
              <span>{serverError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {submitting ? 'Sending…' : 'Submit application'}
          </button>
        </form>
      </div>
    </section>
  );
});

// ── Form helpers ────────────────────────────────────────────────────────

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[12px] font-medium text-scotch">{children}</p>;
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  optional?: boolean;
  err?: string;
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  optional,
  err,
}: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-semibold text-charcoal">
        {label}
        {optional && (
          <span className="ml-1 font-normal text-charcoal-light">(optional)</span>
        )}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={
          'w-full rounded-xl border bg-white px-4 py-3 text-sm text-charcoal placeholder:text-charcoal-light focus:outline-none focus:ring-2 focus:ring-brand/40 ' +
          (err ? 'border-scotch' : 'border-cream-deep')
        }
      />
      {err && <ErrorText>{err}</ErrorText>}
    </div>
  );
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  err?: string;
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  err,
}: SelectFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-semibold text-charcoal">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          'w-full rounded-xl border bg-white px-4 py-3 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-brand/40 ' +
          (err ? 'border-scotch' : 'border-cream-deep')
        }
      >
        <option value="">{placeholder ?? 'Select…'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {err && <ErrorText>{err}</ErrorText>}
    </div>
  );
}

// ── Success panel (replaces the page after submit) ──────────────────────

function SuccessPanel({ snapshot }: { snapshot: FormState }) {
  const firstName = snapshot.fullName.trim().split(/\s+/)[0] || 'there';
  const nextSteps = [
    'We review your application (1–2 business days)',
    'You receive an email with the outcome',
    'If approved - we send you a link to set up your menu and payouts',
    'Go live and start receiving orders',
  ];
  return (
    <div className="flex min-h-[80vh] items-center justify-center bg-cream-warm px-5 py-12 sm:px-8">
      <div className="w-full max-w-xl rounded-3xl bg-white p-8 text-center shadow-card sm:p-10">
        <span
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white"
          aria-hidden
        >
          <Check className="h-7 w-7" />
        </span>
        <h2 className="font-display text-2xl font-black text-charcoal sm:text-3xl">
          Application received
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-charcoal-mid">
          Thanks, <strong className="text-charcoal">{firstName}</strong>. We&rsquo;ve received
          your application for <strong className="text-charcoal">{snapshot.kitchenName}</strong>.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-charcoal-mid">
          We&rsquo;ll review your details and be in touch at{' '}
          <strong className="text-charcoal">{snapshot.email}</strong> within 1–2 business days.
        </p>

        <div className="mt-7 rounded-2xl bg-cream-warm p-5 text-left">
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.12em] text-charcoal">
            What happens next
          </p>
          <ol className="space-y-2.5">
            {nextSteps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="text-[13px] leading-snug text-charcoal-mid">{s}</span>
              </li>
            ))}
          </ol>
        </div>

        <p className="mt-6 text-[12px] font-medium text-charcoal-light">
          Questions? Email{' '}
          <a
            href="mailto:vendors@feastpot.co.uk"
            className="font-bold text-brand hover:underline"
          >
            vendors@feastpot.co.uk
          </a>
        </p>

        <Link
          href="/"
          className="mt-5 inline-block text-[13px] font-semibold text-charcoal-mid hover:text-charcoal"
        >
          ← Back to Feastpot
        </Link>
      </div>
    </div>
  );
}

'use client';

import {
  BadgeCheck,
  CalendarClock,
  Check,
  ChefHat,
  CreditCard,
  Link2,
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
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { KeyTermsSummary, RateCard } from '@feastpot/ui';
import type { RateRow } from '@feastpot/ui';

import { apiRequest, ApiError } from '@/lib/api/client';
import { useTrackEvent } from '@/hooks/use-track-event';

import { EarningsCalculator } from './earnings-calculator';

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
 * inline interest form (revealed when any "Apply to sell" CTA is clicked).
 * No client routing - `showForm` is local state and we smooth-scroll the
 * form into view so the marketing copy stays as context above it.
 *
 * All commercial figures (commission rates, notice period, response time,
 * payout day) come from PLATFORM_FACTS so this page cannot drift from the
 * commission engine. Changing a value in platform-facts.ts updates the
 * page with no other edit.
 */

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Format a float percentage without unnecessary decimal places.
 * PLATFORM_FACTS stores rates as floats; this gives "12" not "12.0".
 */
const pct = (v: number): string => (v % 1 === 0 ? String(Math.trunc(v)) : String(v));

// ── Marketing content constants ──────────────────────────────────────────

const SIX_BENEFITS = [
  {
    Icon: PoundSterling,
    title: 'Stop chasing bank transfers',
    body: 'Customers pay by card at checkout. Money arrives in your account every week, not whenever someone remembers to send it.',
  },
  {
    Icon: CreditCard,
    title: 'Take a deposit on big catering orders',
    body: 'Set a deposit for catering jobs. Feastpot collects it automatically and holds it until you confirm the booking.',
  },
  {
    Icon: Link2,
    title: 'Turn your link in bio into a shop',
    body: `Share your personal Feastpot link on Instagram, WhatsApp or anywhere you promote your kitchen. Orders come in at ${pct(PLATFORM_FACTS.commission.vendorReferred)}% commission while you cook.`,
  },
  {
    Icon: Users,
    title: 'Every order in one place',
    body: 'One dashboard for direct orders, marketplace orders and event enquiries. No more juggling WhatsApp messages, DMs and bank pings.',
  },
  {
    Icon: Settings,
    title: 'Say no automatically',
    body: 'Capacity caps and lead times mean your kitchen never gets overbooked. You set the rules once and the platform enforces them.',
  },
  {
    Icon: ShieldCheck,
    title: 'Allergen labels and records done properly',
    body: 'Generate compliant allergen information for every dish. Records are kept automatically so you are always audit-ready.',
  },
];

const YOU_DECIDE = [
  'Your menu, prices and portion sizes',
  'Delivery area and delivery fee',
  'Lead times (how much notice you need)',
  'Minimum order value',
  'Your customer list - exportable any time',
];

const WE_HANDLE = [
  'Card payments, end to end',
  'Deposits and scheduled orders',
  'Vendor dashboard and order book',
  'Allergen labels for every dish',
  `Weekly payouts on ${PLATFORM_FACTS.payouts.day}`,
  'Discovery on Feastpot (when you want it)',
];

const STEPS = [
  {
    n: 1,
    label: 'Apply',
    sub: 'Tell us about you and your kitchen. Takes about two minutes.',
  },
  {
    n: 2,
    label: 'Quick review',
    sub: 'We review within 1 to 2 business days and help you fix any gaps for free.',
  },
  {
    n: 3,
    label: 'Set up your menu',
    sub: 'Add your dishes, set prices and availability. We help with allergen labelling.',
  },
  {
    n: 4,
    label: 'Start earning immediately',
    sub: 'Share your personal link and take orders from your own customers straight away, without waiting for platform demand.',
  },
];

const FOUNDING_BENEFITS = [
  `${pct(PLATFORM_FACTS.commission.marketplaceFirst)}% Feastpot commission dropped to 0% on marketplace orders for your first 90 days`,
  'A direct line to our founding team for questions, feedback and product decisions',
  'Free listing photography session so your dishes look their best',
  'Featured in our Southwark launch campaign',
  'Early input on features before they go live to all vendors',
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Are you exclusive? Can I still sell elsewhere?',
    a: 'No exclusivity, ever. You can sell through other platforms, your own website, at markets or anywhere you like. Feastpot does not require you to be listed only with us.',
  },
  {
    q: `Will the ${pct(PLATFORM_FACTS.commission.vendorReferred)}% rate on my own orders last?`,
    a: `Yes. We must give at least ${PLATFORM_FACTS.feeChangeNoticeDays} days' written notice before raising any of our rates, and fee changes are never applied retrospectively. You can also leave at any time with ${PLATFORM_FACTS.terminationNoticeDays} days' notice.`,
  },
  {
    q: 'I am not yet council-registered. Can I still apply?',
    a: 'Yes, apply anyway. We will send you a step-by-step guide and connect you with the right contacts at your local authority. Registration is usually straightforward and we will help you fix any gaps for free.',
  },
  {
    q: 'I am registered but still waiting for my hygiene inspection.',
    a: 'You can apply and set up your full profile and menu right now, so you lose no time. Feastpot only lists vendors publicly once they reach an FHRS rating of 3 out of 5 or above, because that is a safety standard we hold every cook to. As soon as your rating comes through and meets the threshold, we switch you on.',
  },
  {
    q: 'Who owns my customers?',
    a: 'You do, without reservation. Your customer list is yours. You can export it from your dashboard at any time and take it with you if you ever decide to leave.',
  },
  {
    q: 'What if I cannot fulfil an order?',
    a: 'Set capacity caps and lead times so the platform automatically stops accepting orders when you are full. You can also pause your kitchen in one tap from the dashboard. If something unexpected happens, our team is available to help manage the customer.',
  },
  {
    q: 'Do my customers pay anything extra?',
    a: `Yes, a service fee of ${PLATFORM_FACTS.serviceFee.percent}% capped at £${(PLATFORM_FACTS.serviceFee.capPence / 100).toFixed(2)}, shown in the price before they order. It never comes out of your payout. On orders you bring us yourself, that fee is the only thing Feastpot earns.`,
  },
];

// ── Form types ────────────────────────────────────────────────────────────

// Friendly labels paired with the API enum values.
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
  deliveryRadiusMiles: string;
  hygieneRegNumber: string;
  orderTypes: string[];
  marketingConsent: boolean;
  terms: boolean;
}

// Mirrors APPLICATION_ORDER_TYPES in the API DTO.
const ORDER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'family_pots', label: 'Family pots' },
  { value: 'party_trays', label: 'Party trays' },
  { value: 'weekly_meal_prep', label: 'Weekly meal prep' },
  { value: 'event_catering', label: 'Event catering' },
  { value: 'small_chops', label: 'Small chops' },
  { value: 'frozen_packs', label: 'Frozen packs' },
];

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
  deliveryRadiusMiles: '',
  hygieneRegNumber: '',
  orderTypes: [],
  marketingConsent: true,
  terms: false,
};

/**
 * Current vendor T&Cs version. Bump when legal materially updates
 * /legal/vendor-terms. Server falls back to its own default if omitted,
 * but we always send it explicitly so the audit row records what the
 * applicant actually SAW on this client at submission time.
 */
const VENDOR_TERMS_VERSION = '2026-05';

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
  hygieneRegNumber: string;
  deliveryRadiusMiles?: number;
  orderTypes?: string[];
  foodStory: string;
  instagram?: string;
  marketingConsent?: boolean;
  acceptedTermsAt: string;
  acceptedTermsVersion: string;
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function BecomeAVendorPage() {
  const formRef = useRef<HTMLElement>(null);
  // Deduplication guard: application_start fires at most once per page load.
  const appStartFiredRef = useRef(false);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedSnapshot, setSubmittedSnapshot] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  // Live commission rates fetched from the public API.
  const [rates, setRates] = useState<RateRow[]>([]);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesError, setRatesError] = useState<string | null>(null);

  const track = useTrackEvent();

  // vendor_page_view: fires once on mount. Ad-blockers may suppress it;
  // order_attribution_source (server-side) remains the authoritative funnel signal.
  useEffect(() => {
    track('vendor_page_view');
  }, [track]);

  useEffect(() => {
    apiRequest<RateRow[]>('/terms/rate-schedule')
      .then(setRates)
      .catch(() => setRatesError('Could not load current rates. Please refresh the page.'))
      .finally(() => setRatesLoading(false));
  }, []);

  const openForm = useCallback(() => {
    setShowForm(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
    });
    // application_start: deduplicated so rapid multi-CTA clicks only fire once.
    if (!appStartFiredRef.current) {
      appStartFiredRef.current = true;
      track('application_start');
    }
  }, [track]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (form.fullName.trim().length < 2) e.fullName = 'Enter your full name';
    if (form.kitchenName.trim().length < 2) e.kitchenName = 'Enter your kitchen or business name';
    if (!form.email.includes('@')) e.email = 'Enter a valid email';
    if (form.phone.replace(/\D/g, '').length < 7) e.phone = 'Enter a valid phone number';
    else if (form.phone.length > 40) e.phone = 'Phone number is too long';
    if (form.postcode.trim().length < 2) e.postcode = 'Enter your postcode';
    else if (form.postcode.trim().length > 16) e.postcode = 'Postcode is too long';
    if (!form.cuisineType) e.cuisineType = 'Select a cuisine type';
    if (form.foodStory.trim().length < 20)
      e.foodStory = 'Tell us a little more (min 20 characters)';
    if (!form.hasFSA) e.hasFSA = 'Please answer this question';
    if (form.hygieneRegNumber.trim().length < 2)
      e.hygieneRegNumber = 'Enter your food hygiene registration number';
    else if (form.hygieneRegNumber.trim().length > 64)
      e.hygieneRegNumber = 'Registration number is too long';
    if (form.deliveryRadiusMiles.trim()) {
      const radius = Number(form.deliveryRadiusMiles);
      if (!Number.isInteger(radius) || radius < 1 || radius > 100)
        e.deliveryRadiusMiles = 'Enter a whole number of miles between 1 and 100';
    }
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
      hygieneRegNumber: form.hygieneRegNumber.trim(),
      ...(form.deliveryRadiusMiles.trim()
        ? { deliveryRadiusMiles: Number(form.deliveryRadiusMiles) }
        : {}),
      ...(form.orderTypes.length ? { orderTypes: form.orderTypes } : {}),
      foodStory: form.foodStory.trim(),
      ...(form.instagram.trim() ? { instagram: form.instagram.trim() } : {}),
      marketingConsent: form.marketingConsent,
      acceptedTermsAt: new Date().toISOString(),
      acceptedTermsVersion: VENDOR_TERMS_VERSION,
    };

    setSubmitting(true);
    try {
      await apiRequest('/vendors/register-interest', { method: 'POST', body: payload });
      setSubmittedSnapshot(form);
      setSubmitted(true);
      // application_complete: fires after the server has persisted the row.
      track('application_complete');
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
      {/* Acquisition nav - lightweight, no persistent customer-site nav here */}
      <nav className="sticky top-0 z-40 border-b border-cream-deep bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8 lg:px-12">
          <Link href="/" aria-label="Feastpot home" className="inline-flex">
            <Image
              src="/images/feastpot-logo.png"
              alt="Feastpot"
              width={317}
              height={100}
              className="h-12 w-auto sm:h-[3.375rem]"
              priority
            />
          </Link>
          <div className="hidden items-center gap-7 lg:flex">
            <a href="#numbers" className="text-sm font-semibold text-charcoal hover:text-brand">
              How the numbers work
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-semibold text-charcoal hover:text-brand"
            >
              How it works
            </a>
          </div>
          <button
            type="button"
            onClick={openForm}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark sm:px-5 sm:py-2.5"
          >
            Apply to sell
          </button>
        </div>
      </nav>

      {/* BLOCK 1: Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-2 lg:gap-12 lg:px-12 lg:py-16">
        <div>
          <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-brand">
            For cooks who already have customers
          </p>
          <h1 className="font-display text-4xl font-black leading-[1.1] tracking-tight text-charcoal sm:text-5xl lg:text-[56px]">
            Keep your customers.
            <br />
            <span className="text-brand">Lose the admin.</span>
          </h1>
          <div className="mt-4 h-[3px] w-16 rounded-full bg-plantain" aria-hidden />
          <p className="mt-5 max-w-xl text-base leading-relaxed text-charcoal-mid">
            You built your following. Feastpot gives you card payments, deposits, an order book and
            allergen labels for your own customers at{' '}
            <strong className="text-charcoal">
              {pct(PLATFORM_FACTS.commission.vendorReferred)}% commission
            </strong>
            . When we send you a new customer, we take{' '}
            <strong className="text-charcoal">
              {pct(PLATFORM_FACTS.commission.marketplaceFirst)}%
            </strong>
            . That is the only time you pay us.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={openForm}
              className="inline-flex items-center justify-center rounded-xl bg-brand px-7 py-3.5 text-sm font-bold text-white shadow-card hover:bg-brand-dark"
            >
              Apply to sell
            </button>
            <a
              href="#numbers"
              className="inline-flex items-center justify-center rounded-xl border-2 border-charcoal bg-white px-7 py-3.5 text-sm font-bold text-charcoal hover:bg-cream"
            >
              See how the numbers work
            </a>
          </div>
          <p className="mt-5 text-[12.5px] font-semibold text-charcoal-mid">
            No upfront fee &middot; No monthly fee &middot;{' '}
            {pct(PLATFORM_FACTS.commission.vendorReferred)}% on your own orders &middot; Weekly
            Stripe payouts &middot; No exclusivity
          </p>
        </div>

        {/* Hero visual */}
        <div className="relative mx-auto aspect-[10/9] w-full max-w-[440px] overflow-hidden rounded-3xl bg-cream-warm shadow-[0_12px_48px_rgba(0,0,0,0.15)] lg:max-w-none">
          <Image
            src="/images/vendor-hero-food.png"
            alt="A bulk spread of jollof rice, grilled chicken, stew, plantain and sides, the kind of feast a Feastpot home cook prepares"
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
              <div className="text-[13px] font-black text-charcoal">You stay in control.</div>
              <div className="text-[11px] font-medium text-charcoal-mid">
                Your menu, prices and delivery
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BLOCK 2: Commercials + Rate calculator */}
      <section
        id="numbers"
        className="border-t border-cream-deep bg-cream-warm py-14"
        aria-labelledby="numbers-heading"
      >
        <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
          <EarningsCalculator />

          {/* Live rate schedule from the database */}
          <RateCard
            rates={rates}
            loading={ratesLoading}
            error={ratesError ?? undefined}
            className="mt-8 mb-6"
          />

          {/* Key Terms Summary (Annex C) */}
          <KeyTermsSummary />

          <p className="mt-4 text-[12px] text-charcoal-mid">
            Read the full{' '}
            <Link
              href="/legal/vendor-terms"
              className="font-semibold text-brand underline-offset-2 hover:underline"
            >
              Vendor Terms of Agreement
            </Link>{' '}
            before applying.
          </p>
        </div>
      </section>

      {/* BLOCK 3: Six benefits */}
      <section
        id="benefits"
        className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:px-12"
        aria-labelledby="benefits-heading"
      >
        <h2
          id="benefits-heading"
          className="mb-2 font-display text-3xl font-black tracking-tight text-charcoal"
        >
          Six things that change when you join
        </h2>
        <p className="mb-8 text-sm font-medium text-charcoal-mid">
          Everything you need to run a professional kitchen without the admin overhead.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SIX_BENEFITS.map(({ Icon, title, body }) => (
            <div key={title} className="rounded-2xl bg-cream-warm p-5">
              <span
                className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light"
                aria-hidden
              >
                <Icon className="h-5 w-5 text-brand" />
              </span>
              <div className="font-display text-[15px] font-black text-charcoal">{title}</div>
              <p className="mt-1.5 text-[13px] leading-snug text-charcoal-mid">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* BLOCK 4: Discovery */}
      <section className="border-t border-cream-deep bg-cream-warm py-14">
        <div className="mx-auto max-w-5xl px-5 text-center sm:px-8 lg:px-12">
          <h2 className="mb-4 font-display text-3xl font-black tracking-tight text-charcoal">
            New customers when you want them
          </h2>
          <p className="mx-auto max-w-2xl text-[15px] leading-relaxed text-charcoal-mid">
            Feastpot lists your kitchen in postcode search by default, so customers looking for food
            in your area can find you straight away. If you are fully booked or want to focus on
            your own regulars, you can switch discovery off from your dashboard in one tap. It is
            not all-or-nothing - you can open to marketplace customers during quiet periods and
            close again when your own orders fill the book.
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand-light px-5 py-2.5">
            <MapPin className="h-4 w-4 text-brand" aria-hidden />
            <span className="text-sm font-semibold text-brand-dark">
              Discovery is an on/off switch, not a commitment
            </span>
          </div>
        </div>
      </section>

      {/* BLOCK 5: Control split */}
      <section
        className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:px-12"
        aria-labelledby="control-heading"
      >
        <h2
          id="control-heading"
          className="mb-8 font-display text-3xl font-black tracking-tight text-charcoal"
        >
          What you control and what we handle
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border-2 border-brand bg-white p-6">
            <p className="mb-4 text-[11px] font-black uppercase tracking-[0.14em] text-brand">
              You decide
            </p>
            <ul className="space-y-3">
              {YOU_DECIDE.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" aria-hidden />
                  <span className="text-[14px] text-charcoal">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-cream-warm p-6">
            <p className="mb-4 text-[11px] font-black uppercase tracking-[0.14em] text-charcoal-mid">
              We handle
            </p>
            <ul className="space-y-3">
              {WE_HANDLE.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-charcoal-mid" aria-hidden />
                  <span className="text-[14px] text-charcoal">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* BLOCK 6: Founding cohort */}
      <section className="border-t border-cream-deep bg-brand py-14">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-16">
            <div className="lg:flex-1">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5">
                <Star className="h-3.5 w-3.5 text-white" aria-hidden />
                <span className="text-[11px] font-black uppercase tracking-[0.14em] text-white">
                  Founding cohort
                </span>
              </div>
              <h2 className="font-display text-3xl font-black leading-tight text-white sm:text-4xl">
                We are signing our first 20 cooks in Southwark
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-white/80">
                We launch postcode by postcode so customers always find a cook nearby. Southwark is
                our first borough and we are keeping the cohort small so every founding cook gets a
                real head start before we open to the wider waitlist.
              </p>
            </div>
            <div className="lg:flex-1">
              <p className="mb-4 text-[11px] font-black uppercase tracking-[0.14em] text-white/60">
                Founding cook benefits
              </p>
              <ul className="space-y-3">
                {FOUNDING_BENEFITS.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-white" aria-hidden />
                    <span className="text-[14px] leading-snug text-white">{item}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={openForm}
                className="mt-7 inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-bold text-brand shadow-card hover:bg-cream"
              >
                Apply for a founding spot
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* BLOCK 7: Onboarding steps */}
      <section id="how-it-works" className="bg-cream-warm py-14">
        <div className="mx-auto max-w-5xl px-5 text-center sm:px-8 lg:px-12">
          <h2 className="font-display text-3xl font-black tracking-tight text-charcoal">
            Four steps to your first order
          </h2>
          <p className="mt-2 text-sm font-medium text-charcoal-mid">
            From application to earning on your own customers the same day
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl bg-white p-6 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand font-display text-base font-black text-white"
                  aria-hidden
                >
                  {s.n}
                </div>
                <div className="font-display text-[15px] font-black text-charcoal">{s.label}</div>
                <p className="mt-1.5 text-[13px] leading-snug text-charcoal-mid">{s.sub}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm font-medium text-charcoal-mid">
            Not sure if you are ready yet?{' '}
            <a
              href="/vendor-readiness"
              className="font-bold text-brand underline-offset-2 hover:underline"
            >
              Read our vendor readiness guide
            </a>{' '}
            for a step-by-step checklist covering registration, hygiene training and allergen
            information.
          </p>
        </div>
      </section>

      {/* BLOCK 8: FAQ */}
      <section
        className="mx-auto max-w-4xl px-5 py-14 sm:px-8 lg:px-12"
        aria-labelledby="faq-heading"
      >
        <h2
          id="faq-heading"
          className="mb-8 font-display text-3xl font-black tracking-tight text-charcoal"
        >
          Questions we get asked
        </h2>
        <div className="space-y-4">
          {FAQ.map(({ q, a }) => (
            <div key={q} className="rounded-2xl border border-cream-deep bg-white p-5">
              <p className="font-display text-[15px] font-black text-charcoal">{q}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-charcoal-mid">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* BLOCK 9: Final CTA */}
      {!showForm && (
        <section className="border-t border-cream-deep bg-cream-warm py-16">
          <div className="mx-auto max-w-xl px-5 text-center sm:px-8">
            <h2 className="font-display text-3xl font-black tracking-tight text-charcoal">
              Nothing to lose by trying it
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-mid">
              No upfront cost. No monthly fee. You can leave at any time with{' '}
              {PLATFORM_FACTS.terminationNoticeDays} days&apos; notice.
            </p>
            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={openForm}
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand px-8 py-4 text-sm font-bold text-white shadow-card hover:bg-brand-dark sm:w-auto"
              >
                Apply to sell
              </button>
              <a
                href="mailto:vendors@feastpot.co.uk"
                className="inline-flex w-full items-center justify-center rounded-xl border-2 border-charcoal bg-white px-8 py-4 text-sm font-bold text-charcoal hover:bg-cream sm:w-auto"
              >
                Talk to us first
              </a>
            </div>
            <p className="mt-4 text-xs font-medium text-charcoal-mid">
              We reply {PLATFORM_FACTS.support.responseTime}.
            </p>
          </div>
        </section>
      )}

      {/* Inline interest form (rendered after click) */}
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

// ── Inline interest form ─────────────────────────────────────────────────

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
          Takes about 2 minutes. We&rsquo;ll be in touch within 1 to 2 business days.
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
            <span
              id="kitchenType-label"
              className="mb-2 block text-[13px] font-semibold text-charcoal"
            >
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

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Food hygiene registration number"
              id="hygieneRegNumber"
              value={form.hygieneRegNumber}
              onChange={(v) => onUpdate('hygieneRegNumber', v)}
              required
              err={errors.hygieneRegNumber}
              placeholder="e.g. your local-authority reference"
            />
            <Field
              label="Delivery radius (miles)"
              id="deliveryRadiusMiles"
              type="number"
              value={form.deliveryRadiusMiles}
              onChange={(v) => onUpdate('deliveryRadiusMiles', v)}
              err={errors.deliveryRadiusMiles}
              optional
              placeholder="e.g. 5"
            />
          </div>

          <div>
            <span
              id="orderTypes-label"
              className="mb-2 block text-[13px] font-semibold text-charcoal"
            >
              Typical order types{' '}
              <span className="font-normal text-charcoal-light">(optional, select any)</span>
            </span>
            <div aria-labelledby="orderTypes-label" className="flex flex-wrap gap-2">
              {ORDER_TYPE_OPTIONS.map((opt) => {
                const active = form.orderTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    onClick={() =>
                      onUpdate(
                        'orderTypes',
                        active
                          ? form.orderTypes.filter((v) => v !== opt.value)
                          : [...form.orderTypes, opt.value],
                      )
                    }
                    className={
                      'rounded-xl border px-4 py-2 text-[13px] font-semibold transition-colors ' +
                      (active
                        ? 'border-brand bg-brand text-white'
                        : 'border-cream-deep bg-white text-charcoal hover:border-brand/40')
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
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

          {/* Key Terms Summary (Annex C) - must appear before contracting */}
          <KeyTermsSummary className="mt-2" />

          <label className="flex cursor-pointer items-start gap-3 text-[13px] font-medium text-charcoal">
            <input
              type="checkbox"
              checked={form.terms}
              onChange={(e) => onUpdate('terms', e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span>
              I have read and agree to the{' '}
              <Link href="/legal/vendor-terms" className="font-bold text-brand hover:underline">
                Vendor Terms of Agreement
              </Link>{' '}
              (including the Rate Schedule) and the{' '}
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
            {submitting ? 'Sending...' : 'Submit application'}
          </button>
        </form>
      </div>
    </section>
  );
});

// ── Form helpers ─────────────────────────────────────────────────────────

function ErrorText({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p id={id} className="mt-1.5 text-[12px] font-medium text-scotch">
      {children}
    </p>
  );
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
  required?: boolean;
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
  required,
  err,
}: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-semibold text-charcoal">
        {label}
        {optional && <span className="ml-1 font-normal text-charcoal-light">(optional)</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-required={required || undefined}
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? `${id}-error` : undefined}
        className={
          'w-full rounded-xl border bg-white px-4 py-3 text-sm text-charcoal placeholder:text-charcoal-light focus:outline-none focus:ring-2 focus:ring-brand/40 ' +
          (err ? 'border-scotch' : 'border-cream-deep')
        }
      />
      {err && <ErrorText id={`${id}-error`}>{err}</ErrorText>}
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

function SelectField({ id, label, value, onChange, options, placeholder, err }: SelectFieldProps) {
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
        <option value="">{placeholder ?? 'Select...'}</option>
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

// ── Success panel (replaces the page after submit) ────────────────────────

function SuccessPanel({ snapshot }: { snapshot: FormState }) {
  const firstName = snapshot.fullName.trim().split(/\s+/)[0] || 'there';
  const nextSteps = [
    'We review your application (1 to 2 business days)',
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
          Thanks, <strong className="text-charcoal">{firstName}</strong>. We&rsquo;ve received your
          application for <strong className="text-charcoal">{snapshot.kitchenName}</strong>.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-charcoal-mid">
          We&rsquo;ll review your details and be in touch at{' '}
          <strong className="text-charcoal">{snapshot.email}</strong> within 1 to 2 business days.
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
          <a href="mailto:vendors@feastpot.co.uk" className="font-bold text-brand hover:underline">
            vendors@feastpot.co.uk
          </a>
        </p>

        <Link
          href="/"
          className="mt-5 inline-block text-[13px] font-semibold text-charcoal-mid hover:text-charcoal"
        >
          Back to Feastpot
        </Link>
      </div>
    </div>
  );
}

import {
  BadgeCheck,
  CalendarClock,
  ChefHat,
  CreditCard,
  MapPin,
  PoundSterling,
  Settings,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Become a Feastpot vendor — turn your cooking into weekly income',
  description:
    'Get paid to cook from home without building a website, chasing customers, or dealing with admin. Join 500+ UK cooks earning weekly with Feastpot.',
};

/**
 * Vendor acquisition landing — Image 2, panel 1.
 *
 * Lives on the customer site (apps/web) so prospective vendors discover
 * it from the "Become a cook" link in the marketing top-nav. Both CTAs
 * deep-link into the vendor portal (apps/vendor) at /onboarding/register
 * and /sign-in respectively, so the customer site never owns vendor
 * auth or onboarding state.
 */
const VENDOR_PORTAL =
  process.env.NEXT_PUBLIC_VENDOR_URL ?? 'https://vendor.feastpot.co.uk';

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
    sub: "We'll review your details within 1–2 days",
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
  {
    Icon: CreditCard,
    value: 'Weekly payouts',
    label: 'On time, every time',
  },
];

export default function BecomeAVendorPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Top nav (marketing) */}
      <nav className="sticky top-0 z-50 border-b border-cream-deep bg-white/95 backdrop-blur">
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
            <a
              href="#benefits"
              className="text-sm font-semibold text-charcoal hover:text-brand"
            >
              Benefits
            </a>
          </div>
          <a
            href={`${VENDOR_PORTAL}/sign-in`}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark sm:px-5 sm:py-2.5"
          >
            Sign in
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-2 lg:gap-12 lg:px-12 lg:py-16">
        <div>
          <h1 className="font-display text-4xl font-black leading-[1.1] tracking-tight text-charcoal sm:text-5xl lg:text-[56px]">
            Turn your cooking
            <br />
            <span className="text-brand">into weekly income</span>
          </h1>
          <div
            className="mt-4 h-[3px] w-16 rounded-full bg-plantain"
            aria-hidden
          />
          <p className="mt-5 max-w-xl text-base leading-relaxed text-charcoal-mid">
            Get paid to cook from home without building a website, chasing
            customers, or dealing with admin. We bring the orders, you focus
            on the food.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href={`${VENDOR_PORTAL}/onboarding/register`}
              className="inline-flex items-center justify-center rounded-xl bg-brand px-7 py-3.5 text-sm font-bold text-white shadow-card hover:bg-brand-dark"
            >
              Register interest
            </a>
            <a
              href={`${VENDOR_PORTAL}/sign-in`}
              className="inline-flex items-center justify-center rounded-xl border-2 border-charcoal bg-white px-7 py-3.5 text-sm font-bold text-charcoal hover:bg-cream"
            >
              Vendor sign in
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
          {/* Floating "you cook" badge */}
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
          <div
            key={label}
            className="rounded-2xl bg-cream-warm p-5"
          >
            <span
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light"
              aria-hidden
            >
              <Icon className="h-5 w-5 text-brand" />
            </span>
            <div className="font-display text-[15px] font-black text-charcoal">
              {label}
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-charcoal-mid">
              {sub}
            </p>
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
                <p className="mt-1.5 text-[13px] leading-snug text-charcoal-mid">
                  {s.sub}
                </p>
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
              <div className="font-display text-[15px] font-black text-charcoal">
                {label}
              </div>
              <p className="mt-1 text-[13px] leading-snug text-charcoal-mid">
                {sub}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* Social proof footer */}
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
              <div className="font-display text-lg font-black text-charcoal">
                {value}
              </div>
              <div className="text-[13px] font-medium text-charcoal-mid">
                {label}
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-2 text-center sm:px-8 lg:px-12">
        <a
          href={`${VENDOR_PORTAL}/onboarding/register`}
          className="inline-flex items-center justify-center rounded-xl bg-brand px-8 py-4 text-sm font-bold text-white shadow-card hover:bg-brand-dark"
        >
          Register your interest
        </a>
        <p className="mt-3 text-xs font-medium text-charcoal-mid">
          We&rsquo;ll get back to you within 1–2 business days.
        </p>
      </section>
    </div>
  );
}

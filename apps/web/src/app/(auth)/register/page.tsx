import { Bell, Heart, MapPin, Shield, ShoppingBag, Star, Truck, Zap } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Create your Feastpot account',
  description:
    'Order African & Caribbean food from local cooks across the UK. Faster checkout, saved addresses, order tracking, loyalty rewards.',
};

/**
 * Customer registration CTA landing — the "panel 1" wireframe.
 *
 * This is a conversion page, not the actual sign-up form. The real form
 * lives at `/register/create-account` (it was the page that previously
 * sat at /register; we moved it down a level so this CTA can take the
 * top slot without disrupting any existing deep links — both Supabase
 * email-confirmation callbacks and the existing /sign-in "Create an
 * account" link go through here first).
 *
 * Layout: desktop = 12-col grid with a 7/5 split (copy left, food photo
 * right). Mobile = single column, photo first then copy then features.
 * The page intentionally bypasses the customer PWA's bottom-nav +
 * top-nav (it has its own marketing nav with the Sign in button) so it
 * reads as a marketing surface and not an in-app screen.
 */
export default function RegisterCtaPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      <main className="mx-auto max-w-6xl px-5 pb-12 pt-8 sm:px-8 lg:pt-14">
        {/* Hero */}
        <section className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="order-2 lg:order-1 lg:col-span-7">
            <h1 className="font-display text-3xl font-black leading-[1.1] tracking-tight text-charcoal sm:text-4xl lg:text-[52px]">
              Create your account and
              <br />
              order the best of
              <br />
              <span className="text-brand">African &amp; Caribbean</span> food
            </h1>

            {/* Plantain underline accent — matches the wireframe's gold rule */}
            <div
              className="mt-4 h-[3px] w-16 rounded-full bg-plantain"
              aria-hidden
            />

            <p className="mt-5 max-w-xl text-base font-medium leading-relaxed text-charcoal-mid">
              Faster checkout, saved addresses, order tracking, exclusive
              offers, loyalty rewards and referral benefits.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sign-in?mode=register"
                className="inline-flex items-center justify-center rounded-xl bg-brand px-7 py-3.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark"
              >
                Create account
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-xl border-2 border-brand bg-white px-7 py-3.5 text-sm font-bold text-brand transition-colors hover:bg-brand-light"
              >
                Sign in
              </Link>
            </div>

            <p className="mt-4 flex items-center gap-2 text-xs font-medium text-charcoal-mid">
              <Shield className="h-4 w-4 text-brand" aria-hidden />
              Trusted by 50,000+ happy food lovers across the UK
            </p>
          </div>

          {/* Right: food photography in a circular crop with chilli accents */}
          <div className="order-1 mx-auto lg:order-2 lg:col-span-5">
            <div className="relative aspect-square w-full max-w-[360px] sm:max-w-[420px]">
              <div className="absolute inset-2 overflow-hidden rounded-full bg-plantain/15 shadow-[0_8px_40px_rgba(0,0,0,0.12)]">
                <Image
                  src="/images/auth-hero-food.png"
                  alt="A spread of African and Caribbean dishes — jollof rice, jerk chicken, plantain curry"
                  fill
                  sizes="(max-width: 1024px) 360px, 420px"
                  className="object-cover"
                  priority
                />
              </div>
              {/* Decorative scotch-bonnet accents — pure CSS so we don't
                  ship another asset just for three little dots. */}
              <ChilliAccent className="absolute -left-1 top-6 h-7 w-7 -rotate-[28deg]" />
              <ChilliAccent className="absolute right-0 top-16 h-6 w-6 rotate-[42deg]" />
              <ChilliAccent className="absolute bottom-10 left-4 h-6 w-6 rotate-[18deg]" />
            </div>
          </div>
        </section>

        {/* 4 benefit cards */}
        <section className="mt-10 grid gap-3 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
          {[
            {
              Icon: Zap,
              label: 'Faster checkout',
              sub: 'Checkout in seconds with saved details',
            },
            {
              Icon: MapPin,
              label: 'Track every order',
              sub: 'Live updates from kitchen to door',
            },
            {
              Icon: Heart,
              label: 'Save favourites',
              sub: 'Build your list and reorder easily',
            },
            {
              Icon: Star,
              label: 'Earn FeastPoints',
              sub: 'Get rewarded for every order & invite',
            },
          ].map(({ Icon, label, sub }) => (
            <div
              key={label}
              className="flex flex-col gap-2 rounded-2xl border border-cream-deep bg-cream-warm/60 p-5"
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light"
                aria-hidden
              >
                <Icon className="h-5 w-5 text-brand" />
              </span>
              <p className="font-display text-[15px] font-black text-charcoal">
                {label}
              </p>
              <p className="text-[13px] font-medium leading-snug text-charcoal-mid">
                {sub}
              </p>
            </div>
          ))}
        </section>

        {/* Social-proof strip */}
        <section className="mt-8 grid gap-5 border-t border-cream-deep pt-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <ProofItem
            visual={
              <div className="flex">
                {['bg-brand', 'bg-plantain', 'bg-scotch', 'bg-charcoal'].map(
                  (c, i) => (
                    <span
                      key={c}
                      className={`h-8 w-8 rounded-full border-2 border-white ${c} ${
                        i > 0 ? '-ml-2' : ''
                      }`}
                      aria-hidden
                    />
                  ),
                )}
              </div>
            }
            title="50,000+"
            subtitle="Happy food lovers"
          />
          <ProofItem
            visual={
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-plantain/15">
                <Star className="h-5 w-5 fill-plantain text-plantain" />
              </span>
            }
            title={
              <span className="text-plantain">★★★★★ <span className="text-charcoal">4.8/5</span></span>
            }
            subtitle="App Store rating"
          />
          <ProofItem
            visual={
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light">
                <Shield className="h-5 w-5 text-brand" />
              </span>
            }
            title="Secure & safe"
            subtitle="Your data is protected"
          />
          <ProofItem
            visual={
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-light">
                <Truck className="h-5 w-5 text-teal" />
              </span>
            }
            title="Fast delivery"
            subtitle="From local kitchens"
          />
        </section>
      </main>
    </div>
  );
}

/**
 * Marketing top nav for the CTA surface. Deliberately separate from the
 * customer PWA's TopNav (which assumes an in-app context with back
 * chevrons and basket state) — this nav is conversion-first and only
 * surfaces the Sign in button + a handful of marketing links.
 */
function MarketingNav() {
  const links = [
    { label: 'Explore', href: '/vendors' },
    { label: 'How it works', href: '/help' },
    { label: 'Become a cook', href: '/vendor/register-interest' },
    { label: 'FeastPass', href: '/feastpass' },
  ];
  return (
    <nav className="sticky top-0 z-50 border-b border-cream-deep bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
        <Link href="/" aria-label="Feastpot home" className="flex items-center">
          <Image
            src="/images/feastpot-logo.png"
            alt="Feastpot"
            width={317}
            height={100}
            className="h-8 w-auto sm:h-9"
            priority
          />
        </Link>
        <ul className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-sm font-semibold text-charcoal hover:text-brand"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            aria-label="Notifications"
            className="hidden text-charcoal hover:text-brand sm:block"
          >
            <Bell className="h-5 w-5" />
          </button>
          <Link
            href="/basket"
            aria-label="Basket"
            className="hidden text-charcoal hover:text-brand sm:block"
          >
            <ShoppingBag className="h-5 w-5" />
          </Link>
          <Link
            href="/sign-in"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark sm:px-5 sm:py-2.5"
          >
            Sign in
          </Link>
        </div>
      </div>
    </nav>
  );
}

function ProofItem({
  visual,
  title,
  subtitle,
}: {
  visual: React.ReactNode;
  title: React.ReactNode;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {visual}
      <div className="min-w-0">
        <div className="font-display text-[15px] font-black text-charcoal">
          {title}
        </div>
        <div className="text-xs font-medium text-charcoal-mid">{subtitle}</div>
      </div>
    </div>
  );
}

/**
 * Tiny inline SVG scotch-bonnet chilli — three of these are scattered
 * around the food photo as decorative accents. Inline avoids a network
 * round-trip for a 1KB shape and keeps the colour theme-controllable
 * via `text-scotch` on the parent.
 */
function ChilliAccent({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      role="presentation"
    >
      <path
        d="M14 3c1.2.6 2 1.8 2 3 0 .6-.2 1-.4 1.4 2.4 1.4 4.4 4.2 4.4 7.6 0 4-3 7-7 7s-7-3-7-7c0-4.6 4-8 8-9 0-1.2-.6-2.4-.8-3 .2 0 .5 0 .8 0z"
        className="fill-scotch"
      />
      <path
        d="M14 3c.5 1 .8 1.8.8 2.4-.4-.1-.9-.2-1.4-.2-.5 0-1 .1-1.4.2.4-1.2 1-2.2 2-2.4z"
        className="fill-brand"
      />
    </svg>
  );
}

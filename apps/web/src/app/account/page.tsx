'use client';

import { HelpCircle, LogOut, MapPin, Receipt, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Avatar } from '@/components/account/avatar';
import { LoyaltyCard } from '@/components/account/loyalty-card';
import { ReferralCard } from '@/components/account/referral-card';
import { useMe } from '@/hooks/use-me';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { createClient } from '@/lib/supabase/client';

/**
 * Account hub. /account/* is auth-gated by the root middleware so we know a
 * Supabase session exists; we still call our own `/v1/users/me` so the
 * displayed name/email/avatar matches the canonical record (the JWT only
 * has whatever was set when the user signed up).
 *
 * Layout: profile header card on top, 2×2 grid of destination cards in the
 * middle, sign-out at the bottom (with a confirm dialog so an accidental
 * tap doesn't kick the customer out).
 */
export default function AccountHubPage() {
  const router = useRouter();
  const { token, loading: authLoading } = useAccessToken();
  const { data: me, isLoading } = useMe();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    if (!confirm('Sign out of Feastpot?')) return;
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/sign-in');
  };

  // Guest hub — `/account` (exact) is intentionally NOT middleware-
  // gated so that the bottom-nav "Account" tap on a fresh visitor
  // lands on a benefits-led welcome instead of a sign-in form. The
  // benefits list is the same value-prop pitch we use across the
  // marketing surface so the message stays coherent.
  if (!authLoading && !token) {
    return <GuestAccountWelcome />;
  }

  return (
    <div className="space-y-5 px-4 py-4">
      {/* Profile header */}
      <header className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <Avatar
          url={me?.avatarUrl ?? null}
          name={me?.fullName ?? me?.email ?? null}
          size={64}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-dark">
            {isLoading ? '…' : me?.fullName || me?.email || '—'}
          </p>
          {me?.email && (
            <p className="truncate text-xs text-mid">{me.email}</p>
          )}
          <Link
            href="/account/profile"
            className="mt-1 inline-block text-xs font-semibold text-brand hover:underline"
          >
            Edit profile →
          </Link>
        </div>
      </header>

      <LoyaltyCard />
      <ReferralCard />

      {/* 2×2 destination grid */}
      <ul className="grid grid-cols-2 gap-3">
        <NavCard
          href="/account/orders"
          emoji="📦"
          title="Orders"
          subtitle="Past orders & reorders"
          icon={<Receipt className="h-5 w-5 text-brand" aria-hidden />}
        />
        <NavCard
          href="/account/addresses"
          emoji="📍"
          title="Addresses"
          subtitle="Manage delivery addresses"
          icon={<MapPin className="h-5 w-5 text-brand" aria-hidden />}
        />
        <NavCard
          href="/account/profile"
          emoji="👤"
          title="Profile"
          subtitle="Photo, name, contact"
          icon={<UserCircle className="h-5 w-5 text-brand" aria-hidden />}
        />
        <NavCard
          href="/help"
          emoji="❓"
          title="Help"
          subtitle="FAQs and support"
          icon={<HelpCircle className="h-5 w-5 text-brand" aria-hidden />}
        />
      </ul>

      {/* Sign-out — brand-coloured to be unmistakable, but the confirm
          dialog above prevents accidental taps. */}
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-brand/30 bg-white py-3 text-sm font-semibold text-brand hover:bg-brand/5 disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}

function GuestAccountWelcome() {
  // Benefits list is rendered server-deterministically (no t() / no
  // CMS) so AT users hear the same copy as sighted users. Emojis are
  // aria-hidden — the adjacent text already names the benefit.
  const benefits: { icon: string; text: string }[] = [
    { icon: '📦', text: 'Track your orders in real time' },
    { icon: '🔁', text: 'One-tap reorder your favourites' },
    { icon: '⭐', text: 'Earn loyalty points with every order' },
    { icon: '🎁', text: 'Refer friends and earn £5 each' },
    { icon: '📍', text: 'Save your delivery addresses' },
  ];
  return (
    <section className="px-4 py-6">
      <h1 className="font-display text-2xl font-extrabold text-dark">Join Feastpot</h1>
      <p className="mt-1.5 text-sm text-mid">
        Sign in to unlock your full Feastpot experience
      </p>

      <ul className="mt-5">
        {benefits.map((b) => (
          <li
            key={b.text}
            className="flex items-center gap-3 border-b border-cream-warm/70 py-3 last:border-b-0"
          >
            <span className="text-[22px] leading-none" aria-hidden>
              {b.icon}
            </span>
            <span className="text-sm text-dark">{b.text}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/sign-in?redirect=/account"
        className="touch-target mt-6 block rounded-2xl bg-brand py-4 text-center text-base font-bold text-white shadow-card transition-colors hover:bg-brand-dark"
      >
        Sign in
      </Link>
      <Link
        href="/register"
        className="block py-3 text-center text-sm text-mid hover:text-dark"
      >
        Create a free account
      </Link>
      <Link
        href="/vendors"
        className="mt-1 block text-center text-[13px] text-subtle hover:text-mid"
      >
        Continue browsing without signing in →
      </Link>
    </section>
  );
}

function NavCard({
  href,
  emoji,
  title,
  subtitle,
  icon,
}: {
  href: string;
  emoji: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex h-full flex-col gap-1.5 rounded-2xl border border-border bg-white p-4 shadow-sm transition-colors hover:border-brand/40 hover:bg-brand/5"
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none" aria-hidden>{emoji}</span>
          {/* Hide the lucide icon visually — the emoji carries the visual.
              We keep it in the markup as a quiet semantic anchor and so a
              future redesign can flip back to vector icons by removing
              `sr-only`. */}
          <span className="sr-only">{icon}</span>
        </div>
        <p className="text-sm font-bold text-dark">{title}</p>
        <p className="text-[11px] leading-snug text-mid">{subtitle}</p>
      </Link>
    </li>
  );
}

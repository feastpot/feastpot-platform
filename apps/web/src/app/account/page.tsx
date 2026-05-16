'use client';

import {
  Gift,
  HelpCircle,
  LogOut,
  MapPin,
  Package,
  PackageOpen,
  Receipt,
  Repeat2,
  Star,
  UserCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@feastpot/ui';

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
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onSignOut = async () => {
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
      <header className="flex items-center gap-4 rounded-2xl border border-cream-deep bg-white p-4 shadow-card">
        <Avatar
          url={me?.avatarUrl ?? null}
          name={me?.fullName ?? me?.email ?? null}
          size={64}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-black text-charcoal">
            {isLoading ? '…' : me?.fullName || me?.email || '—'}
          </p>
          {me?.email && (
            <p className="truncate text-xs font-medium text-charcoal-mid">{me.email}</p>
          )}
          <Link
            href="/account/profile"
            className="mt-1 inline-block text-xs font-bold text-brand hover:underline"
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
          title="Orders"
          subtitle="Past orders & reorders"
          Icon={Receipt}
        />
        <NavCard
          href="/account/addresses"
          title="Addresses"
          subtitle="Manage delivery addresses"
          Icon={MapPin}
        />
        <NavCard
          href="/account/profile"
          title="Profile"
          subtitle="Photo, name, contact"
          Icon={UserCircle}
        />
        <NavCard
          href="/help"
          title="Help"
          subtitle="FAQs and support"
          Icon={HelpCircle}
        />
      </ul>

      {/* Sign-out — opens a branded confirm dialog instead of the
          native window.confirm() which renders as a flat OS-chrome
          "www.feastpot.co.uk says" alert that breaks the visual
          language of the rest of the app. */}
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={signingOut}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-brand/30 bg-white py-3 text-sm font-bold text-brand hover:bg-brand-light disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>

      <Dialog open={confirmOpen} onOpenChange={(o) => !signingOut && setConfirmOpen(o)}>
        <DialogContent className="max-w-sm rounded-2xl border-cream-deep p-0 shadow-card">
          <div className="flex flex-col items-center gap-3 px-6 pb-2 pt-7 text-center">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-light"
              aria-hidden
            >
              <LogOut className="h-5 w-5 text-brand" />
            </span>
            <DialogHeader className="space-y-1.5 text-center sm:text-center">
              <DialogTitle className="font-display text-lg font-black text-charcoal">
                Sign out of Feastpot?
              </DialogTitle>
              <DialogDescription className="text-sm font-medium text-charcoal-mid">
                You'll need to sign in again to track orders, redeem points, or
                reorder your favourites.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex flex-col-reverse gap-2 px-6 pb-6 pt-4 sm:flex-row sm:gap-3">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={signingOut}
              className="flex-1 rounded-xl border border-cream-deep bg-white py-3 text-sm font-bold text-charcoal hover:bg-cream-warm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSignOut}
              disabled={signingOut}
              className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-card hover:bg-brand-dark disabled:opacity-50"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GuestAccountWelcome() {
  const benefits: { Icon: typeof Package; text: string }[] = [
    { Icon: PackageOpen, text: 'Track your orders in real time' },
    { Icon: Repeat2, text: 'One-tap reorder your favourites' },
    { Icon: Star, text: 'Earn loyalty points with every order' },
    { Icon: Gift, text: 'Refer friends and earn £5 each' },
    { Icon: MapPin, text: 'Save your delivery addresses' },
  ];
  return (
    <section className="px-4 py-6">
      <h1 className="font-display text-2xl font-black text-charcoal">Join Feastpot</h1>
      <p className="mt-1.5 text-sm font-medium text-charcoal-mid">
        Sign in to unlock your full Feastpot experience
      </p>

      <ul className="mt-5">
        {benefits.map(({ Icon, text }) => (
          <li
            key={text}
            className="flex items-center gap-3 border-b border-cream-warm/70 py-3 last:border-b-0"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light"
              aria-hidden
            >
              <Icon className="h-4 w-4 text-brand" />
            </span>
            <span className="text-sm font-medium text-charcoal">{text}</span>
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
        className="block py-3 text-center text-sm font-medium text-charcoal-mid hover:text-charcoal"
      >
        Create a free account
      </Link>
      <Link
        href="/vendors"
        className="mt-1 block text-center text-[13px] font-medium text-charcoal-mid/70 hover:text-charcoal-mid"
      >
        Continue browsing without signing in →
      </Link>
    </section>
  );
}

function NavCard({
  href,
  title,
  subtitle,
  Icon,
}: {
  href: string;
  title: string;
  subtitle: string;
  Icon: typeof Receipt;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex h-full flex-col gap-1.5 rounded-2xl border border-cream-deep bg-white p-4 shadow-card transition-colors hover:border-brand/40 hover:bg-brand-light"
      >
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light"
          aria-hidden
        >
          <Icon className="h-5 w-5 text-brand" />
        </span>
        <p className="font-display text-sm font-black text-charcoal">{title}</p>
        <p className="text-[11px] font-medium leading-snug text-charcoal-mid">{subtitle}</p>
      </Link>
    </li>
  );
}

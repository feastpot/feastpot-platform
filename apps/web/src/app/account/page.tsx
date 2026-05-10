'use client';

import { ChevronRight, LogOut, MapPin, Receipt, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Avatar } from '@/components/account/avatar';
import { PageShell } from '@/components/layout/page-shell';
import { useMe } from '@/hooks/use-me';
import { createClient } from '@/lib/supabase/client';

/**
 * Account hub. /account/* is auth-gated by the root middleware so we know a
 * Supabase session exists; we still call our own `/v1/users/me` so the
 * displayed name/email/avatar matches the canonical record (the JWT only
 * has whatever was set when the user signed up).
 */
export default function AccountHubPage() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/sign-in');
  };

  return (
    <PageShell>
      <div className="space-y-5 py-4">
        <header className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
          <Avatar url={me?.avatarUrl ?? null} name={me?.fullName ?? me?.email ?? null} size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Signed in as</p>
            <p className="truncate text-base font-semibold text-foreground">
              {isLoading ? '…' : me?.fullName || me?.email || '—'}
            </p>
            {me?.fullName && me?.email && (
              <p className="truncate text-xs text-muted-foreground">{me.email}</p>
            )}
          </div>
        </header>

        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          <Row
            href="/account/orders"
            icon={<Receipt className="h-5 w-5 text-brand" aria-hidden />}
            title="Order history"
            subtitle="View past orders, reorder, raise disputes"
          />
          <Row
            href="/account/addresses"
            icon={<MapPin className="h-5 w-5 text-brand" aria-hidden />}
            title="Saved addresses"
            subtitle="Manage delivery addresses for faster checkout"
          />
          <Row
            href="/account/profile"
            icon={<UserCircle className="h-5 w-5 text-brand" aria-hidden />}
            title="Profile"
            subtitle="Photo, name, contact details"
          />
        </ul>

        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-muted/40 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </PageShell>
  );
}

function Row({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-4 hover:bg-muted/40">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10">{icon}</span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          <span className="block text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

'use client';

import { ChevronRight, MapPin, Receipt, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { PageShell } from '@/components/layout/page-shell';
import { createClient } from '@/lib/supabase/client';

interface Profile {
  email: string;
  name: string | null;
}

/**
 * Account hub. /account/* is auth-gated by the root middleware so we know a
 * Supabase session exists; we read the user header straight from the
 * browser client to avoid a round-trip to the API just for a name+email.
 */
export default function AccountHubPage() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (data.user) {
        const meta = (data.user.user_metadata ?? {}) as { full_name?: string; first_name?: string; last_name?: string };
        const name =
          meta.full_name ||
          [meta.first_name, meta.last_name].filter(Boolean).join(' ') ||
          null;
        setProfile({ email: data.user.email ?? '', name });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell>
      <div className="space-y-5 py-4">
        <header className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Signed in as</p>
          <p className="text-lg font-semibold text-foreground">{profile?.name || profile?.email || '—'}</p>
          {profile?.name && profile?.email && (
            <p className="text-sm text-muted-foreground">{profile.email}</p>
          )}
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
            subtitle="Name, contact details, notification preferences"
          />
        </ul>
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

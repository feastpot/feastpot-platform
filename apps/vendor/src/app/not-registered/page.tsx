'use client';

import { Button } from '@feastpot/ui';
import Link from 'next/link';
import { useEffect } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Recovery destination for an Auth identity that has vendor metadata but no
 * platform vendor profile. It is deliberately public in middleware: otherwise
 * an existing session would be sent straight back to `/orders` before this
 * explanation could render.
 */
export default function VendorNotRegisteredPage() {
  useEffect(() => {
    // A direct session visit reaches this page before the sign-in form gets a
    // chance to clear the invalid portal session. Clear it here so following
    // the application CTA does not retain a stranded vendor-portal session.
    void createClient().auth.signOut();
  }, []);

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">Vendor account required</h1>
      <p className="max-w-md text-muted-foreground">
        This account is not registered as a vendor.{' '}
        <Link href="/onboarding/register" className="font-semibold underline">
          Apply here.
        </Link>
      </p>
      <Link href="/onboarding/register">
        <Button>Apply to become a vendor</Button>
      </Link>
    </main>
  );
}

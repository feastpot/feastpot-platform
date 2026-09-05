import { ChevronLeft } from 'lucide-react';
import { redirect } from 'next/navigation';

import { VendorPageHeader } from '@feastpot/ui';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/server';

import { CateringQuoteForm } from './quote-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Catering quote | Feastpot Vendor' };

export default async function CateringQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/catering');

  let vendor: { id: string; businessName: string; status: string };
  try {
    vendor = await apiRequest('/vendors/me', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      redirect('/unauthorized');
    }
    throw err;
  }
  if (vendor.status !== 'live' && vendor.status !== 'probation') redirect('/onboarding');

  return (
    <PortalShell businessName={vendor.businessName} maxWidth="form">
      <VendorPageHeader
        title="Catering quote"
        description="Build an itemised menu quote with allergen information for each dish."
        breadcrumb={[{ label: 'Catering bookings', href: '/catering' }]}
        action={
          <a
            href="/catering"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-mid hover:bg-surface sm:w-auto"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Cancel
          </a>
        }
      />

      <CateringQuoteForm bookingId={id} />
    </PortalShell>
  );
}

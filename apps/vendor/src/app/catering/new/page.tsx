import { ChevronLeft } from 'lucide-react';
import { redirect } from 'next/navigation';

import { VendorPageHeader } from '@feastpot/ui';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/server';

import { CateringQuoteForm } from '../[id]/quote/quote-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New catering quote | Feastpot Vendor' };

export default async function NewCateringQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ enquiryId?: string }>;
}) {
  const { enquiryId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/catering/new');

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
        title="New catering quote"
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

      {enquiryId ? (
        <CateringQuoteForm enquiryId={enquiryId} />
      ) : (
        <section
          aria-labelledby="no-enquiry-heading"
          className="rounded-lg border border-dashed p-6 text-center"
        >
          <h2 id="no-enquiry-heading" className="text-base font-semibold text-dark">
            No catering enquiry selected
          </h2>
          <p className="mt-2 text-sm text-mid">
            Open a routed catering enquiry before creating a quote so the customer and event details
            stay attached.
          </p>
          <a
            href="/catering"
            className="mt-4 inline-flex rounded-md border border-border px-4 py-2 text-sm font-medium text-dark hover:bg-surface"
          >
            View catering bookings
          </a>
        </section>
      )}
    </PortalShell>
  );
}

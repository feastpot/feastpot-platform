import { redirect } from 'next/navigation';
import { type Metadata } from 'next';

import { VendorPageHeader } from '@feastpot/ui';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { TaxInformationClient } from './tax-information-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tax information | Feastpot Vendor Portal',
  description: 'View and manage the tax information Feastpot holds about you for HMRC reporting.',
};

export default async function TaxInformationPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/tax-information');

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
        title="Tax information"
        description="View the tax details Feastpot holds for HMRC reporting."
      />
      <TaxInformationClient />
    </PortalShell>
  );
}

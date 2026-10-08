import { redirect } from 'next/navigation';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { CloseAccountClient } from './close-account-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Close your account | Feastpot Vendor' };

interface VendorSummary {
  id: string;
  businessName: string;
  status: string;
}

export default async function CloseAccountPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/settings/close-account');

  const token = session.access_token;

  let vendor: VendorSummary;
  try {
    vendor = await apiRequest<VendorSummary>('/vendors/me', { accessToken: token });
  } catch {
    redirect('/unauthorized');
  }

  return (
    <PortalShell businessName={vendor.businessName} maxWidth="form">
      <CloseAccountClient businessName={vendor.businessName} />
    </PortalShell>
  );
}

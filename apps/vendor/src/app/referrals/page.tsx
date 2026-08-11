import { Link2 } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { ReferralsClient } from './referrals-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bring your own customers | Feastpot Vendor',
};

interface VendorMe {
  id: string;
  businessName: string;
  status: string;
}

interface ReferralLink {
  id: string;
  slug: string;
  referralUrl: string;
  qrUrls: { png: string; svg: string } | null;
  createdAt: string;
}

export default async function ReferralsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/referrals');

  let vendor: VendorMe;
  try {
    vendor = await apiRequest<VendorMe>('/vendors/me', {
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

  let link: ReferralLink | null = null;
  try {
    link = await apiRequest<ReferralLink>('/attribution/links/me', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    });
  } catch {
    // Render with null; client will surface an error state.
  }

  return (
    <PortalShell businessName={vendor.businessName}>
          <header className="mb-6 flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/10">
              <Link2 className="h-5 w-5 text-teal" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-dark">Bring your own customers</h1>
              <p className="mt-1 text-sm text-mid">
                Share your link or QR code. Orders via your link are tracked separately so
                you can see the impact of your own marketing.
              </p>
            </div>
          </header>
          <ReferralsClient link={link} vendorId={vendor.id} />
    </PortalShell>
  );
}

import { QrCode } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { ShareClient } from './share-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Share your kitchen | Feastpot Vendor',
};

interface VendorMe {
  id: string;
  businessName: string;
  status: string;
  slug: string;
}

export default async function SharePage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/share');

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

  if (vendor.status !== 'live' && vendor.status !== 'probation') {
    redirect('/onboarding/welcome');
  }

  // Canonical link: slug is URL-encoded so special characters are safe.
  // ?src=vendor is the VENDOR attribution marker (Prompt 7): orders placed
  // via this link are tracked as vendor-referred and attract 0% commission.
  const canonicalLink = `https://feastpot.co.uk/v/${encodeURIComponent(vendor.slug)}?src=vendor`;

  return (
    <PortalShell businessName={vendor.businessName}>
      <header className="mb-6 flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/10">
          <QrCode className="h-5 w-5 text-teal" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-bold text-dark">Share your kitchen</h1>
          <p className="mt-1 text-sm text-mid">
            Orders through your personal link are tracked as your own referrals at{' '}
            <strong>0% commission</strong> - share it everywhere.
          </p>
        </div>
      </header>
      <ShareClient
        canonicalLink={canonicalLink}
        slug={vendor.slug}
        businessName={vendor.businessName}
        vendorId={vendor.id}
      />
    </PortalShell>
  );
}

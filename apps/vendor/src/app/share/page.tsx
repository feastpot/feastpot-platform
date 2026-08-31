import { QrCode } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { ShareAndCustomersClient } from './share-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Share and customers | Feastpot Vendor',
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

  // The canonical share link comes from VendorReferralLink (attribution system),
  // NOT from Vendor.slug. The /v/[slug] route records a click only when the slug
  // matches a VendorReferralLink record; if Vendor.slug is used instead and the
  // two differ, fp_ref is never set and orders are attributed as marketplace.
  let link: ReferralLink | null = null;
  let linkLoadFailed = false;
  try {
    link = await apiRequest<ReferralLink>('/attribution/links/me', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    });
  } catch (err) {
    // A missing row is a recoverable creation race. Transport/auth/server
    // failures are different and must not masquerade as an endless setup state.
    if (!(err instanceof ApiError && err.status === 404)) linkLoadFailed = true;
  }

  return (
    <PortalShell businessName={vendor.businessName}>
      <header className="mb-6 flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/10">
          <QrCode className="h-5 w-5 text-teal" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-bold text-dark">Share and customers</h1>
          <p className="mt-1 text-sm text-mid">
            Orders through your personal link are tracked as your own referrals at{' '}
            <strong>0% commission</strong>. Share it everywhere and see the impact below.
          </p>
        </div>
      </header>
      <ShareAndCustomersClient
        link={link}
        businessName={vendor.businessName}
        vendorId={vendor.id}
        initialLinkLoadFailed={linkLoadFailed}
      />
    </PortalShell>
  );
}

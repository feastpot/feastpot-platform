import { QrCode } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';

import { COMMISSION_RATES } from '@feastpot/config/commission-rates';
import type { RateRow } from '@feastpot/ui';

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

async function createInitialQrUrls(referralUrl: string) {
  const url = new URL(referralUrl);
  url.searchParams.set('m', 'qr');
  const options = {
    errorCorrectionLevel: 'H' as const,
    margin: 4,
    width: 1024,
    color: { dark: '#000000', light: '#ffffff' },
  };
  const [png, svgMarkup] = await Promise.all([
    QRCode.toDataURL(url.toString(), options),
    QRCode.toString(url.toString(), { ...options, type: 'svg' }),
  ]);
  return {
    png,
    svg: `data:image/svg+xml;base64,${Buffer.from(svgMarkup).toString('base64')}`,
  };
}

export default async function SharePage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/share');

  const vendorPromise = apiRequest<VendorMe>('/vendors/me', {
    accessToken: session.access_token,
    next: { revalidate: 0 },
  }).catch((err: unknown) => {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      redirect('/unauthorized');
    }
    throw err;
  });
  const ratesPromise = apiRequest<RateRow[]>('/terms/rate-schedule', {
    next: { revalidate: 3600 },
  }).catch(() => []);
  const linkPromise = apiRequest<ReferralLink>('/attribution/links/me', {
    accessToken: session.access_token,
    next: { revalidate: 0 },
  })
    .then((link) => ({ link, linkLoadFailed: false }))
    .catch((err: unknown) => ({
      link: null,
      // A missing row is a recoverable creation race. Transport/auth/server
      // failures must not masquerade as an endless setup state.
      linkLoadFailed: !(err instanceof ApiError && err.status === 404),
    }));

  const [vendor, rates, linkResult] = await Promise.all([vendorPromise, ratesPromise, linkPromise]);
  if (vendor.status !== 'live' && vendor.status !== 'probation') {
    redirect('/onboarding/welcome');
  }
  const vendorReferredRate =
    rates.find((rate) => rate.key === 'referred_commission' && rate.status === 'LIVE')?.rateValue ??
    COMMISSION_RATES.vendorReferred.percent;

  // The canonical share link comes from VendorReferralLink (attribution system),
  // NOT from Vendor.slug. The /v/[slug] route records a click only when the slug
  // matches a VendorReferralLink record; if Vendor.slug is used instead and the
  // two differ, fp_ref is never set and orders are attributed as marketplace.
  const { link, linkLoadFailed } = linkResult;
  const initialQrUrls = link && !link.qrUrls ? await createInitialQrUrls(link.referralUrl) : null;

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
            <strong>{vendorReferredRate}% commission</strong>. Share it everywhere and see the
            impact below.
          </p>
        </div>
      </header>
      <ShareAndCustomersClient
        link={link}
        initialQrUrls={initialQrUrls}
        businessName={vendor.businessName}
        vendorId={vendor.id}
        initialLinkLoadFailed={linkLoadFailed}
      />
    </PortalShell>
  );
}

import { redirect } from 'next/navigation';

import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { OrderDetailClient } from './order-detail-client';

export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: 'pending' | 'approved' | 'live' | 'suspended' | 'probation' | 'removed';
}

/**
 * Full order detail page (T003). Same SSR gate as /availability and
 * /compliance: an unauthenticated visitor is bounced to sign-in, a vendor
 * that has not yet been approved gets pushed back into onboarding.
 *
 * We do NOT prefetch the order on the server because the client uses
 * TanStack Query for live invalidation when the vendor performs an action.
 * Hitting the API twice (SSR + CSR) would just churn cache without buying
 * any LCP benefit on this gated, signed-in surface.
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect(`/sign-in?next=/orders/${id}`);

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

  if (vendor.status === 'pending' || vendor.status === 'approved') {
    redirect('/onboarding');
  }

  return (
    <PortalShell businessName={vendor.businessName}>
      {/* print:py-0 is applied to the inner wrapper; the layout shell's
          px-4 py-6 padding is overridden only for print. */}
      <div className="print:!py-0">
        <OrderDetailClient orderId={id} />
      </div>
    </PortalShell>
  );
}

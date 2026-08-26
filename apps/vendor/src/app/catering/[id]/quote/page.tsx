import { ChevronLeft } from 'lucide-react';
import { redirect } from 'next/navigation';

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
      {/* Breadcrumb + header */}
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-mid">
        <a href="/catering" className="hover:text-dark hover:underline">
          Catering bookings
        </a>
        <span aria-hidden className="select-none text-mid/50">
          /
        </span>
        <span className="font-medium text-dark">Edit quote</span>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-dark">Catering quote</h1>
          <p className="mt-1 text-sm text-mid">
            Build an itemised menu quote with allergen information for each dish.
          </p>
        </div>
        <a
          href="/catering"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-mid hover:bg-surface"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Cancel
        </a>
      </div>

      <CateringQuoteForm bookingId={id} />
    </PortalShell>
  );
}

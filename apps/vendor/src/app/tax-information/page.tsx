import { redirect } from 'next/navigation';
import { type Metadata } from 'next';

import { SideNav } from '@/components/layout/side-nav';
import { TopNav } from '@/components/layout/top-nav';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { TaxInformationClient } from './tax-information-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tax information | FeastPot Vendor Portal',
  description: 'View and manage the tax information FeastPot holds about you for HMRC reporting.',
};

export default async function TaxInformationPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/tax-information');

  return (
    <>
      <div className="md:hidden">
        <TopNav />
      </div>
      <div className="flex min-h-screen bg-surface">
        <SideNav />
        <main className="min-w-0 flex-1">
          <TaxInformationClient />
        </main>
      </div>
    </>
  );
}

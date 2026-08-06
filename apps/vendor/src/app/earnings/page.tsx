import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { EarningsClient } from './earnings-client';

export const metadata = { title: 'Earnings & fees | Feastpot Vendor' };

export default async function EarningsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return <EarningsClient />;
}

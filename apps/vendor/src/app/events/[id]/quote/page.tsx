import { redirect } from 'next/navigation';

import { TopNav } from '@/components/layout/top-nav';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { QuoteForm } from './quote-form';

export const dynamic = 'force-dynamic';

export default async function QuoteSubmitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect(`/sign-in?next=/events/${id}/quote`);

  return (
    <div>
      <TopNav />
      <main className="mx-auto max-w-2xl p-4">
        <QuoteForm enquiryId={id} accessToken={session.access_token} />
      </main>
    </div>
  );
}

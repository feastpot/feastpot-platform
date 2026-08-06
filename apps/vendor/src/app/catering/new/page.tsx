import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { CateringQuoteForm } from '../[id]/quote/quote-form';

export const metadata = { title: 'New catering quote | Feastpot Vendor' };

export default async function NewCateringQuotePage({
  searchParams,
}: {
  searchParams: { enquiryId?: string };
}) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/catering/new');

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">New catering quote</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build an itemised menu quote with allergen information for each dish.
        </p>
      </div>
      <CateringQuoteForm enquiryId={searchParams.enquiryId} />
    </div>
  );
}

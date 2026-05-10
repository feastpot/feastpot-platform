import { redirect } from 'next/navigation';

import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { ItemEditorClient } from './item-editor-client';

// Reads cookies via Supabase server client → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: string;
}

export default async function MenuItemEditorPage({
  params,
}: {
  params: Promise<{ menuId: string; itemId: string }>;
}) {
  const { menuId, itemId } = await params;
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect(`/sign-in?next=/menu/${menuId}/items/${itemId}`);

  let vendor: VendorMe;
  try {
    vendor = await apiRequest<VendorMe>('/vendors/me', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) redirect('/unauthorized');
    throw err;
  }
  if (vendor.status !== 'live' && vendor.status !== 'probation') redirect('/onboarding');

  return (
    <>
      <TopNav businessName={vendor.businessName} />
      <main className="container py-6">
        <ItemEditorClient vendorId={vendor.id} menuId={menuId} itemId={itemId} />
      </main>
    </>
  );
}

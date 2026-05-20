import { redirect } from 'next/navigation';

import { TopNav } from '@/components/layout/top-nav';
import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { MenuItemsGridClient } from './items-grid-client';

// Reads cookies via Supabase server client → must be dynamic at runtime.
export const dynamic = 'force-dynamic';

interface VendorMe {
  id: string;
  businessName: string;
  status: string;
  slug: string;
}

interface MenuLite {
  id: string;
  name: string;
  isActive: boolean;
}

export default async function MenuItemsPage({ params }: { params: Promise<{ menuId: string }> }) {
  const { menuId } = await params;
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect(`/sign-in?next=/menu/${menuId}`);

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

  // Resolve the menu name from the includeInactive list (so inactive menus
  // still show their name on the items page rather than "Menu").
  let menuName = 'Menu';
  try {
    const menus = await apiRequest<MenuLite[]>(`/vendors/${vendor.id}/menus`, {
      accessToken: session.access_token,
      query: { includeInactive: 'true' },
      next: { revalidate: 0 },
    });
    menuName = menus.find((m) => m.id === menuId)?.name ?? menuName;
  } catch {
    // Non-fatal - the items grid will surface its own load error.
  }

  return (
    <>
      <TopNav businessName={vendor.businessName} />
      <main className="container py-6">
        <MenuItemsGridClient
          vendorId={vendor.id}
          vendorSlug={vendor.slug}
          menuId={menuId}
          menuName={menuName}
        />
      </main>
    </>
  );
}

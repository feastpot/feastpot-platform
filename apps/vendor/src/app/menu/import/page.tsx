import { redirect } from 'next/navigation';

import { RoleGate } from '@/components/auth/role-gate';
import { PortalShell } from '@/components/layout/portal-shell';
import { apiRequest } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

import { MenuImportClient } from './menu-import-client';

export const dynamic = 'force-dynamic';

export default async function MenuImportPage() {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/sign-in?next=/menu/import');
  const vendor = await apiRequest<{ id: string; businessName: string }>('/vendors/me', {
    accessToken: session.access_token,
    next: { revalidate: 0 },
  });
  return (
    <PortalShell businessName={vendor.businessName}>
      <RoleGate path="/menu">
        <MenuImportClient vendorId={vendor.id} />
      </RoleGate>
    </PortalShell>
  );
}

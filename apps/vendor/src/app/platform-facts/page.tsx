import { PortalShell } from '@/components/layout/portal-shell';
import { PlatformFacts } from '@/components/platform-facts';
import { ApiError, apiRequest } from '@/lib/api/client';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PlatformFactsPage() {
  // Facts remain public, but signed-in vendors must retain their portal navigation.
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  let vendor: { businessName: string } | null = null;
  if (session) {
    try {
      vendor = await apiRequest<{ businessName: string }>('/vendors/me', {
        accessToken: session.access_token,
        next: { revalidate: 0 },
      });
    } catch (error) {
      if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error;
    }
  }
  const content = (
    <div className="mx-auto min-w-0 max-w-4xl text-slate-900">
      <h1 className="text-3xl font-bold">Platform facts</h1>
      <p className="mt-3 text-slate-600">Current commercial, policy and support information.</p>
      <PlatformFacts />
    </div>
  );
  return vendor ? (
    <PortalShell businessName={vendor.businessName}>{content}</PortalShell>
  ) : (
    <main className="px-6 py-12">{content}</main>
  );
}

import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { PlatformFacts } from '@/components/platform-facts';
import { requireStaff } from '@/lib/auth/server-gate';

export const dynamic = 'force-dynamic';

export default async function PlatformFactsPage() {
  const user = await requireStaff('/platform-facts', ['admin', 'support', 'finance', 'compliance']);
  return (
    <StaffShell user={user}>
      <div className="mx-auto max-w-4xl px-6 py-12 text-slate-900">
        <h1 className="text-3xl font-bold">Platform facts</h1>
        <p className="mt-3 text-slate-600">Current commercial, policy and support information.</p>
        <PlatformFacts />
      </div>
    </StaffShell>
  );
}

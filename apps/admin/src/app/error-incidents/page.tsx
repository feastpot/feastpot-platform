import { StaffShell } from '@/components/layout/staff-shell-wrapper';
import { requireStaff } from '@/lib/auth/server-gate';

import { IncidentsClient } from './incidents-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Error incidents | Feastpot Admin' };

export default async function ErrorIncidentsPage() {
  const user = await requireStaff('/error-incidents', ['admin', 'support', 'compliance', 'finance']);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';

  return (
    <StaffShell user={user}>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Error incidents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each row is a real exception logged from a vendor, customer or admin
            session. Paste a vendor-quoted ref (e.g. FP-3A9C-F102) into the search
            box to locate the incident instantly.
          </p>
        </div>
        <IncidentsClient accessToken={user.accessToken} apiUrl={apiUrl} />
      </div>
    </StaffShell>
  );
}

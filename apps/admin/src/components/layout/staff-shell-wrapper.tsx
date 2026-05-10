import { AdminShell } from '@/components/layout/admin-shell';
import type { StaffUser } from '@/lib/auth/server-gate';
import { staffDisplayName } from '@/lib/auth/server-gate';

/**
 * Wraps a server-resolved StaffUser into the client-side AdminShell. Avoids
 * leaking the JWT into the client tree by passing only display fields.
 */
export function StaffShell({ user, children }: { user: StaffUser; children: React.ReactNode }) {
  return (
    <AdminShell
      user={{ name: staffDisplayName(user), email: user.email, role: user.role }}
    >
      {children}
    </AdminShell>
  );
}

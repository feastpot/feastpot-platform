'use client';

import { ShieldAlert } from 'lucide-react';
import { useEffect } from 'react';

import { canVendorRoleAccess, useMyVendorRole } from '@/hooks/use-vendor-members';

/**
 * T010: client-side RBAC gate. Wrap a page body in this to keep
 * non-permitted roles out of sensitive surfaces (e.g. payouts, menu
 * editor). Server-side enforcement still lives on the API (write
 * endpoints reject mismatched callers) - this is the UX layer so a
 * `staff` user doesn't load a screen they cannot use.
 */
export function RoleGate({
  path,
  children,
}: {
  path: string;
  children: React.ReactNode;
}) {
  const { data, isLoading } = useMyVendorRole();

  // Tell the top-nav to re-evaluate visible links when the role lands.
  useEffect(() => {
    // no-op: react-query cache shared with TopNav already triggers re-render.
  }, [data?.role]);

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Checking permissions…</p>;
  }
  const role = data?.role ?? null;
  if (!canVendorRoleAccess(role, path)) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
        <h2 className="mt-3 text-lg font-semibold">No access to this section</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your role on this team does not include this page. Ask the vendor owner if you need access.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

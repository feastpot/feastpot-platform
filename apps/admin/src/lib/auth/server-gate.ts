import { redirect } from 'next/navigation';

import { apiRequest, ApiError } from '@/lib/api/client';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

export type StaffRole = 'admin' | 'support' | 'finance' | 'compliance';

export interface StaffUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: StaffRole;
  accessToken: string;
}

interface ApiUserMe {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'customer' | 'vendor' | StaffRole;
}

const STAFF_ROLES: ReadonlyArray<StaffRole> = ['admin', 'support', 'finance', 'compliance'];

/**
 * Server-side gate used by every admin page. Returns the current staff user
 * + access token (so server components can pass it to apiRequest), or
 * redirects to /sign-in or /unauthorized as appropriate.
 *
 * `allowedRoles` lets a route narrow further (e.g. payouts → admin/finance only).
 */
export async function requireStaff(
  pathname: string,
  allowedRoles?: ReadonlyArray<StaffRole>,
): Promise<StaffUser> {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(pathname)}`);

  let me: ApiUserMe;
  try {
    me = await apiRequest<ApiUserMe>('/users/me', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)) {
      redirect('/unauthorized');
    }
    throw err;
  }

  if (!STAFF_ROLES.includes(me.role as StaffRole)) {
    redirect('/unauthorized');
  }
  const role = me.role as StaffRole;
  if (allowedRoles && !allowedRoles.includes(role)) {
    redirect('/unauthorized');
  }

  return {
    id: me.id,
    email: me.email,
    firstName: me.firstName,
    lastName: me.lastName,
    role,
    accessToken: session.access_token,
  };
}

export function staffDisplayName(u: StaffUser): string {
  const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return name || u.email;
}

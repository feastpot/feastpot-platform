import { redirect } from 'next/navigation';

import { apiRequest, ApiError } from '@/lib/api/client';
import { isAdminMfaEnforced } from '@/lib/auth/mfa-enforcement';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

export type StaffRole = 'admin' | 'support' | 'finance' | 'compliance';

export interface StaffUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: StaffRole;
  accessToken: string;
  /** AAL decoded from the validated session JWT. */
  aal: 'aal1' | 'aal2';
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
 * Decode the `aal` claim from a Supabase JWT (Node runtime -- Buffer available).
 * Falls back to aal1 for any missing or malformed claim.
 */
function decodeAalFromJwt(jwt: string): 'aal1' | 'aal2' {
  try {
    const parts = jwt.split('.');
    const payload = parts[1];
    if (!payload) return 'aal1';
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    return decoded.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return 'aal1';
  }
}

/**
 * Server-side gate used by every admin page. Returns the current staff user
 * + access token (so server components can pass it to apiRequest), or
 * redirects to /sign-in or /unauthorized as appropriate.
 *
 * When both admin MFA flags are true, an aal1 session is redirected to
 * /settings/2fa. If either flag is absent or false, every route except the
 * enrolment page is blocked until deployment configuration is repaired.
 *
 * `allowedRoles` lets a route narrow further (e.g. payouts -> admin/finance only).
 */
export async function requireStaff(
  pathname: string,
  allowedRoles?: ReadonlyArray<StaffRole>,
  opts?: { skipAalCheck?: boolean },
): Promise<StaffUser> {
  const supabase = await createServerSupabase();
  // Validate the JWT against Supabase Auth (server-side) -- getUser() re-checks
  // the signature and revocation list, getSession() only reads the cookie.
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) redirect(`/sign-in?next=${encodeURIComponent(pathname)}`);

  // After a successful getUser() (which the middleware also refreshes on every
  // request) the cookie session is guaranteed fresh; pull the access_token to
  // forward to the API.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(pathname)}`);

  // Defence-in-depth: even if a request bypasses middleware, never serve a
  // privileged server component while admin MFA configuration is incomplete.
  // The /settings/2fa page passes skipAalCheck to keep enrolment reachable.
  const requireAal2 = isAdminMfaEnforced();
  const aal = decodeAalFromJwt(session.access_token);
  if (!opts?.skipAalCheck && !requireAal2) {
    redirect('/unauthorized?reason=mfa-configuration');
  }
  if (requireAal2 && !opts?.skipAalCheck && aal !== 'aal2') {
    redirect(`/settings/2fa?next=${encodeURIComponent(pathname)}`);
  }

  let me: ApiUserMe;
  try {
    me = await apiRequest<ApiUserMe>('/users/me', {
      accessToken: session.access_token,
      next: { revalidate: 0 },
    });
  } catch (err) {
    if (
      err instanceof ApiError &&
      (err.status === 401 || err.status === 403 || err.status === 404)
    ) {
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
    aal,
  };
}

export function staffDisplayName(u: StaffUser): string {
  const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return name || u.email;
}

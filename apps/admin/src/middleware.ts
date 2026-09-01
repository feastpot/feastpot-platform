import { NextResponse, type NextRequest } from 'next/server';

import { isAdminMfaEnforced } from '@/lib/auth/mfa-enforcement';
import { createClient } from '@/lib/supabase/middleware';

/**
 * Auth-gate middleware. Refreshes the Supabase session via `getUser()`
 * (NOT `getSession()` -- see the Supabase Next 15 SSR docs for why), then:
 *
 * 1. Redirects unauthenticated requests to /sign-in.
 * 2. When both admin MFA flags are true, redirects aal1 staff sessions to
 *    /settings/2fa so the user can complete TOTP enrolment before accessing
 *    any protected route.
 *
 * Edge-case: factor removal after a session was aal2. Supabase's getUser()
 * validates the token server-side on every request; the middleware SSR client
 * also automatically refreshes tokens near expiry. When a factor is removed
 * via the Supabase Dashboard, the next token refresh (up to 1 hour) issues
 * a new JWT with aal1. Until that refresh the user retains their aal2 claim.
 * For immediate revocation an admin should also invalidate the user's sessions
 * from the Supabase Dashboard (Auth -> Users -> Invalidate all sessions).
 */

// Routes the middleware never redirects away from, regardless of auth state.
const PUBLIC_PATHS = ['/sign-in', '/unauthorized'];

// Routes accessible to an authenticated but aal1 user (enrolment + its API).
// Must include /settings/2fa itself to prevent redirect loops, and any API
// routes the enrolment page hits (Supabase client handles MFA directly, so
// no additional API routes are needed here).
const AAL2_ALLOWLIST = ['/settings/2fa', '/sign-in', '/unauthorized'];

/**
 * Decode the `aal` claim from a Supabase JWT without a network round-trip.
 * Supabase issues aal2 only after a successful mfa.verify(); anything else
 * (missing, malformed, unknown value) falls back to the safer aal1.
 *
 * Uses atob() rather than Buffer so this runs cleanly in the Next.js edge
 * runtime (middleware).
 */
function decodeAalFromJwt(jwt: string | undefined): 'aal1' | 'aal2' {
  if (!jwt) return 'aal1';
  try {
    const parts = jwt.split('.');
    const segment = parts[1];
    if (!segment) return 'aal1';
    // Base64url -> base64 -> JSON
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(padded)) as Record<string, unknown>;
    return decoded.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return 'aal1';
  }
}

export async function middleware(request: NextRequest) {
  const { supabase, response } = createClient(request);

  // getUser() validates the JWT against Supabase Auth server-side AND
  // refreshes the session if the token is near expiry, writing updated
  // cookies onto `response`. Never use getSession() here -- it only reads
  // the cookie without re-validating.
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', pathname + (request.nextUrl.search || ''));
    return NextResponse.redirect(url);
  }

  const isAal2Allowed = AAL2_ALLOWLIST.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Fail closed for a production misconfiguration: only the sign-in and
  // enrolment/recovery paths remain reachable until both flag surfaces agree.
  const mfaEnforced = isAdminMfaEnforced();
  if (user && !mfaEnforced && !isAal2Allowed) {
    const url = request.nextUrl.clone();
    url.pathname = '/unauthorized';
    url.searchParams.set('reason', 'mfa-configuration');
    return NextResponse.redirect(url);
  }

  if (user && mfaEnforced) {
    if (!isAal2Allowed) {
      // Read aal from the (possibly just-refreshed) session JWT.
      const { data: sessionData } = await supabase.auth.getSession();
      const aal = decodeAalFromJwt(sessionData.session?.access_token ?? undefined);
      if (aal !== 'aal2') {
        const url = request.nextUrl.clone();
        url.pathname = '/settings/2fa';
        // Preserve the original destination so the enrolment page can
        // redirect there after a successful TOTP verify.
        url.searchParams.set('next', pathname + (request.nextUrl.search || ''));
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  // Skip the middleware for static assets, image optimisation, and the favicon --
  // they don't need a Supabase round-trip.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

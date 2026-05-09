import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from './lib/supabase/middleware';

/**
 * Edge middleware runs on every matched request and does two jobs:
 *
 *  1. Refresh the Supabase session cookie (rotating JWTs are short-lived;
 *     without this, a user appears "logged in" client-side but Server
 *     Components see them as anonymous).
 *  2. Gate auth-only routes (`/account/*`) and bounce already-signed-in
 *     users away from `/sign-in`.
 *
 * Cookie preservation: when we redirect, we copy the response cookies set by
 * Supabase's session-refresh onto the redirect response. Forgetting this is
 * the classic "user logs in, gets redirected, appears logged out" bug.
 */
export async function middleware(request: NextRequest) {
  const { supabase, response } = createClient(request);

  // IMPORTANT: getUser() (NOT getSession()) — this contacts Supabase Auth and
  // forces a token refresh + revocation check. getSession() trusts the cookie
  // blindly and is unsafe for auth gates.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAccountRoute = pathname.startsWith('/account');
  const isSignInRoute = pathname === '/sign-in' || pathname.startsWith('/sign-in/');

  if (isAccountRoute && !user) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = '/sign-in';
    signInUrl.searchParams.set('next', pathname);
    return redirectPreservingCookies(signInUrl, response);
  }

  if (isSignInRoute && user) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    return redirectPreservingCookies(homeUrl, response);
  }

  return response;
}

/**
 * Build a redirect that carries over EVERY Set-Cookie header (with full
 * attributes: HttpOnly, Secure, SameSite, Path, Expires, Max-Age, …) from
 * Supabase's session-refresh response.
 *
 * `NextResponse.cookies.set(name, value)` would only copy name+value and
 * silently drop the security attributes — turning short-lived HttpOnly auth
 * cookies into long-lived JS-readable ones, a real auth-cookie weakening
 * bug. Forwarding raw `Set-Cookie` headers preserves the originals exactly.
 */
function redirectPreservingCookies(url: URL, source: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  // `headers.getSetCookie()` returns each Set-Cookie line individually so
  // multi-cookie responses are preserved correctly (single `.get('set-cookie')`
  // joins them with commas, which corrupts cookies whose value contains `,`).
  const setCookies = source.headers.getSetCookie();
  for (const sc of setCookies) {
    redirect.headers.append('set-cookie', sc);
  }
  return redirect;
}

export const config = {
  // Skip Next internals + static assets so we don't run on every CSS/image.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/|public/).*)'],
};

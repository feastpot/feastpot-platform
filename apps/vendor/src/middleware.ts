import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from './lib/supabase/middleware';

/**
 * Vendor-portal edge middleware:
 *
 *  1. Refresh the Supabase session cookie on every request via `getUser()`
 *     (NOT `getSession()` — see apps/web/src/middleware.ts for why).
 *  2. Gate every route except `/sign-in` and `/unauthorized`: unauthed users
 *     get bounced to `/sign-in?next=<path>`.
 *
 * We deliberately do NOT check `user.role === 'vendor'` or vendor `status`
 * here — that requires hitting the API/Prisma which is slow and flaky from
 * edge middleware. Those checks live in the `/orders` server component
 * (which already has to fetch the vendor's profile to render the dashboard),
 * which redirects to `/unauthorized` or `/onboarding` as needed.
 */
export async function middleware(request: NextRequest) {
  const { supabase, response } = createClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isSignIn = pathname === '/sign-in' || pathname.startsWith('/sign-in/');
  const isPublic = isSignIn || pathname === '/unauthorized';

  if (!isPublic && !user) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = '/sign-in';
    signInUrl.searchParams.set('next', pathname);
    return redirectPreservingCookies(signInUrl, response);
  }

  if (isSignIn && user) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/orders';
    homeUrl.search = '';
    return redirectPreservingCookies(homeUrl, response);
  }

  return response;
}

function redirectPreservingCookies(url: URL, source: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  // Forward raw Set-Cookie headers (preserves HttpOnly/Secure/SameSite
  // attributes that NextResponse.cookies.set would silently drop).
  source.headers.getSetCookie().forEach((c) => redirect.headers.append('set-cookie', c));
  return redirect;
}

export const config = {
  matcher: [
    // Skip Next internals and static assets.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|js|css|map)$).*)',
  ],
};

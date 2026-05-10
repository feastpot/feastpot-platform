import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/middleware';

/**
 * Auth-gate middleware. Refreshes the Supabase session via `getUser()`
 * (NOT `getSession()` — see the Supabase Next 15 SSR docs for why), then
 * redirects unauthenticated requests to `/sign-in?next=…` for any path
 * that isn't itself part of the public auth surface.
 */
const PUBLIC_PATHS = ['/sign-in', '/unauthorized'];

export async function middleware(request: NextRequest) {
  const { supabase, response } = createClient(request);

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

  return response;
}

export const config = {
  // Skip the middleware for static assets, image optimisation, and the favicon —
  // they don't need a Supabase round-trip.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};

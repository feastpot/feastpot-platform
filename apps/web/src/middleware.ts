import { NextResponse, type NextRequest } from 'next/server';

import { safeRedirect } from './lib/safe-redirect';
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
  // ------------------------------------------------------------------
  // status.feastpot.co.uk: dedicated status host.
  //  - `/` rewrites to the status page so customers checking an outage
  //    land on it immediately.
  //  - `/status` (and its sub-assets) serve normally.
  //  - Every other path 308s to www so the whole site isn't duplicated
  //    on this host (SEO duplicate-content + confusing UX).
  // Handled BEFORE the Supabase session refresh: the status page must
  // stay readable even if auth is the thing that's down.
  // ------------------------------------------------------------------
  const host = request.headers.get('host')?.toLowerCase() ?? '';
  if (host === 'status.feastpot.co.uk') {
    const { pathname } = request.nextUrl;
    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/status';
      return NextResponse.rewrite(url);
    }
    if (pathname === '/status' || pathname.startsWith('/status/')) {
      return NextResponse.next();
    }
    const www = request.nextUrl.clone();
    www.protocol = 'https:';
    www.host = 'www.feastpot.co.uk';
    www.port = '';
    return NextResponse.redirect(www, 308);
  }

  const { supabase, response } = createClient(request);

  // IMPORTANT: getUser() (NOT getSession()) - this contacts Supabase Auth and
  // forces a token refresh + revocation check. getSession() trusts the cookie
  // blindly and is unsafe for auth gates.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Role-based portal routing: vendors and staff should never land on the
  // customer site's auth-gated pages. Their role lives in app_metadata
  // (server-managed, set by the Supabase auth hook + admin updateUserById).
  // We redirect them to their own portal so they don't see a confusing
  // customer-shaped UI - and so they can't accidentally browse account pages
  // that are scoped to customer orders/addresses.
  const role = (user?.app_metadata?.role as string | undefined) ?? null;
  const isNonCustomer =
    role === 'vendor' ||
    role === 'admin' ||
    role === 'finance' ||
    role === 'support' ||
    role === 'compliance';

  if (isNonCustomer) {
    const isAccountSubRoute = pathname.startsWith('/account/');
    const isCustomerOrderRoute = pathname === '/orders' || pathname.startsWith('/orders/');
    const isSignInRoute = pathname === '/sign-in' || pathname.startsWith('/sign-in/');

    if (isAccountSubRoute || isCustomerOrderRoute || isSignInRoute) {
      // Vendors go to the vendor portal; staff go to the admin portal.
      // Fall back to a safe public URL if the env var is missing.
      const vendorPortalUrl =
        process.env.NEXT_PUBLIC_VENDOR_PORTAL_URL ??
        process.env.VENDOR_PORTAL_URL ??
        'https://vendor.feastpot.co.uk';
      const adminPortalUrl = process.env.ADMIN_URL ?? 'https://admin.feastpot.co.uk';
      const destination = role === 'vendor' ? vendorPortalUrl : adminPortalUrl;
      return NextResponse.redirect(destination);
    }

    // Non-customers may still browse public pages (menu browsing, occasion
    // pages, become-a-vendor, etc.) - only block the customer-specific routes.
    return response;
  }

  // From here: user is either unauthenticated or has role=customer.

  // `/account` (exact) is the public hub that shows a guest welcome /
  // benefits CTA when the user isn't signed in - older / first-time
  // visitors are far more likely to tap "Account" out of curiosity than
  // commit to sign-in cold, and a hard redirect on that exploratory tap
  // reads as punishing. Only the *sub*-routes (`/account/orders`,
  // `/account/profile`, `/account/addresses`, …) are auth-gated because
  // those genuinely need a user to render.
  const isAccountSubRoute = pathname.startsWith('/account/');
  const isSignInRoute = pathname === '/sign-in' || pathname.startsWith('/sign-in/');

  if (isAccountSubRoute && !user) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = '/sign-in';
    // `pathname` is already an internal route here, but we still pass it
    // through `safeRedirect` so this branch can never become a vector if
    // the matcher ever broadens. Defense-in-depth: the sign-in page also
    // re-validates `next` before consuming it.
    signInUrl.searchParams.set('next', safeRedirect(pathname, '/'));
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
 * silently drop the security attributes - turning short-lived HttpOnly auth
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

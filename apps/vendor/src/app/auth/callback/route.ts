import { NextResponse, type NextRequest } from 'next/server';

import { safeRedirect } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/middleware';

/**
 * Vendor-portal OAuth + email-confirmation landing route.
 *
 * Mirrors apps/web/src/app/auth/callback/route.ts but without the
 * users/sync call (vendor portal does not mirror to public.users on the
 * same path - vendor account data lives in the vendor schema and is
 * managed separately).
 *
 * Supabase redirects here with `?code=...` after:
 *   - A vendor completes Google sign-in
 *   - A vendor clicks a password-reset link (type=recovery)
 *   - An email confirmation link is clicked
 *
 * The `?next=` param controls the final destination:
 *   - Password reset: /auth/callback?type=recovery&next=/auth/reset/update
 *   - Default: /orders (vendor dashboard)
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/orders';
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    const back = new URL(`/sign-in?error=${encodeURIComponent(errorParam)}`, url.origin);
    return NextResponse.redirect(back);
  }

  if (!code) {
    return NextResponse.redirect(new URL('/orders', url.origin));
  }

  const { supabase, response } = createClient(request);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const back = new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, url.origin);
    const setCookies = response.headers.getSetCookie();
    const redirect = NextResponse.redirect(back);
    setCookies.forEach((sc) => redirect.headers.append('set-cookie', sc));
    return redirect;
  }

  // For recovery, guard that the destination is /auth/reset/update.
  // safeRedirect already blocks external and protocol-relative URLs.
  const destination = safeRedirect(next, '/orders');
  const dest = new URL(destination, url.origin);
  const redirect = NextResponse.redirect(dest);
  response.headers.getSetCookie().forEach((sc) => redirect.headers.append('set-cookie', sc));
  return redirect;
}

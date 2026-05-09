import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/middleware';

/**
 * OAuth + email-confirmation landing route.
 *
 * Supabase redirects here with `?code=…` after the user completes Google
 * sign-in or clicks an email confirmation / reset link. We exchange the code
 * for a session (which sets the cookies) and then redirect to `?next=…` (or
 * the home page).
 *
 * Cookie attributes: we use the same `createClient` helper as middleware so
 * `Set-Cookie` headers carry the full security attributes (HttpOnly, Secure,
 * SameSite) — see the writeup in lib/supabase/middleware.ts.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';
  const errorParam = url.searchParams.get('error');

  // Provider returned an error before the code exchange — bounce to sign-in
  // with the message so the user knows what happened.
  if (errorParam) {
    const back = new URL(`/sign-in?error=${encodeURIComponent(errorParam)}`, url.origin);
    return NextResponse.redirect(back);
  }

  if (!code) {
    // No code, no error — landing page hit directly. Send home.
    return NextResponse.redirect(new URL('/', url.origin));
  }

  const { supabase, response } = createClient(request);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const back = new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, url.origin);
    // Carry over any Set-Cookie that may have already been emitted.
    const setCookies = response.headers.getSetCookie();
    const redirect = NextResponse.redirect(back);
    setCookies.forEach((sc) => redirect.headers.append('set-cookie', sc));
    return redirect;
  }

  // Success — redirect to `next`, preserving the freshly-set session cookies.
  const dest = new URL(next.startsWith('/') ? next : '/', url.origin);
  const redirect = NextResponse.redirect(dest);
  response.headers.getSetCookie().forEach((sc) => redirect.headers.append('set-cookie', sc));
  return redirect;
}

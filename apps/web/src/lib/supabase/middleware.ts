import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Build a request-scoped Supabase client and a NextResponse that mirrors any
 * cookie writes (session refresh) back to the browser.
 *
 * Returns the response so the caller (middleware.ts) can either:
 *  - return it directly to let the request proceed with refreshed cookies, or
 *  - swap it for `NextResponse.redirect(...)` while preserving the cookies via
 *    `redirectResponse.cookies.set(...)`.
 */
export function createClient(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — set them in apps/web/.env.local',
    );
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        // Mirror cookies onto BOTH the request (so downstream code in this
        // request sees the fresh session) and the response (so the browser
        // stores the refreshed cookies for next time).
        cookiesToSet.forEach(({ name, value }: CookieToSet) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }: CookieToSet) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  return { supabase, response };
}

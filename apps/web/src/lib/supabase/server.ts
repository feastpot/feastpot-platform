import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * Why `cookies()` is awaited: in Next 15 the cookies API became async. Calling
 * it eagerly here lets us pass a stable `CookieStore` reference into
 * `createServerClient`'s adapter. The setter is wrapped in try/catch because
 * Server Components are not allowed to mutate cookies — only Server Actions
 * and Route Handlers are. The `getUser()` middleware path is the canonical
 * place where session refresh writes happen.
 */
export async function createClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — set them in apps/web/.env.local',
    );
  }
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — Next.js disallows cookie writes
          // here. Safe to ignore: the session is refreshed in middleware
          // (where writes ARE allowed) on every request.
        }
      },
    },
  });
}

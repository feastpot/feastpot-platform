import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * See apps/web/src/lib/supabase/server.ts for the rationale on the try/catch
 * around `cookieStore.set` (Server Components can't mutate cookies; the
 * middleware path is where the session refresh writes happen).
 */
export async function createClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY - set them in apps/vendor/.env.local',
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
          // Server Components can't write cookies - that's middleware's job.
        }
      },
    },
  });
}

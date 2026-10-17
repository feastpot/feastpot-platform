import type { Page } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';

/**
 * Read the real browser context's SSR cookie session, including chunked cookies.
 * Never replace vendor authentication with a factory-minted or staff token.
 */
export async function browserAccessToken(page: Page): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error('Vendor browser session requires Supabase public configuration.');
  const origin = new URL(page.url()).origin;
  const context = page.context();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => context.cookies(origin),
      setAll: async (cookiesToSet) => {
        // Persist a normal Supabase refresh into the same browser context.
        // Long suites can outlive the original access token; never mint a
        // replacement factory identity or discard refreshed/chunked cookies.
        await context.addCookies(
          cookiesToSet.map(({ name, value, options }) => ({
            name,
            value,
            domain: new URL(origin).hostname,
            path: options.path ?? '/',
            httpOnly: options.httpOnly ?? false,
            secure: options.secure ?? origin.startsWith('https:'),
            ...(options.maxAge !== undefined
              ? {
                  expires: options.maxAge <= 0 ? 1 : Math.floor(Date.now() / 1000) + options.maxAge,
                }
              : options.expires
                ? { expires: options.expires.getTime() / 1000 }
                : {}),
            sameSite:
              options.sameSite === 'strict'
                ? ('Strict' as const)
                : options.sameSite === 'none'
                  ? ('None' as const)
                  : ('Lax' as const),
          })),
        );
      },
    },
  });
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Factory vendor browser context has no valid SSR cookie session.');
  }
  return data.session.access_token;
}

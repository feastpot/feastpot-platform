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
  const cookies = await page.context().cookies(new URL(page.url()).origin);
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => cookies,
      setAll: () => {
        throw new Error('Vendor browser session needs refreshing through the portal.');
      },
    },
  });
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Factory vendor browser context has no valid SSR cookie session.');
  }
  return data.session.access_token;
}

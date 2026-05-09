'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client for use inside Client Components.
 *
 * Reads NEXT_PUBLIC_* env vars — these are inlined at build time, so leaving
 * them undefined will produce a clear runtime error instead of silently
 * pointing at the wrong project. We intentionally throw here (vs. returning a
 * dummy client) so a missing config is caught immediately in dev.
 */
export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — set them in apps/web/.env.local',
    );
  }
  return createBrowserClient(url, anonKey);
}

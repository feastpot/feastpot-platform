'use client';

import { useAuthState } from '@/lib/auth/auth-provider';

/**
 * Returns the current Supabase access token (JWT) for the signed-in
 * vendor, or `null` if not signed in.
 *
 * Backed by the app-wide `<AuthProvider>` so every consumer shares one
 * `getSession()` call + one `onAuthStateChange` subscription instead
 * of spinning up its own per-hook listener.
 */
export function useAccessToken(): { token: string | null; loading: boolean } {
  return useAuthState();
}

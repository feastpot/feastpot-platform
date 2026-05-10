'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Returns the current Supabase access token (JWT) for the signed-in user, or
 * `null` if the user isn't signed in. The token is what the API expects in
 * its `Authorization: Bearer …` header for every protected route.
 *
 * Subscribes to `onAuthStateChange` so the value stays fresh across sign in /
 * out / token refresh in another tab — important because the customer can
 * leave the checkout page open while their access token quietly rotates.
 */
export function useAccessToken(): { token: string | null; loading: boolean } {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setToken(data.session?.access_token ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setToken(session?.access_token ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { token, loading };
}

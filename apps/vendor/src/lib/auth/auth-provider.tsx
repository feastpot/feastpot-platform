'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { createClient } from '@/lib/supabase/client';

interface AuthState {
  token: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ token: null, loading: true });

/**
 * Single auth-state provider mounted at the root of the vendor app.
 *
 * Before this existed, every hook that needed an access token called
 * `useAccessToken()`, which set up its own `supabase.auth.getSession()`
 * + `onAuthStateChange` subscription per component instance. On a busy
 * page (SideNav + TopNav + members + inbox + role + page-specific
 * hooks) that meant a handful of identical getSession round-trips and
 * auth listeners fanning out on every navigation.
 *
 * One provider, one subscription, one shared `{ token, loading }`
 * snapshot — every hook just reads from context.
 *
 * The provider also owns the **cross-session cache barrier**: when
 * Supabase reports a SIGNED_OUT or a SIGNED_IN to a different user id
 * (e.g. user A signs out and user B signs in inside the same tab),
 * it flushes the entire QueryClient so cached, user-scoped data such
 * as the long-cached vendor role cannot leak between identities.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ token: null, loading: true });
  const queryClient = useQueryClient();
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      currentUserIdRef.current = data.session?.user?.id ?? null;
      setState({ token: data.session?.access_token ?? null, loading: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      const nextUserId = session?.user?.id ?? null;
      const prevUserId = currentUserIdRef.current;

      // Wipe every cached query whenever the identity actually changes
      // (sign-out, or sign-in as a different user). TanStack Query's
      // queryClient.clear() removes both data and inflight observers,
      // so role-gated UI re-runs from a clean slate for the new user.
      if (event === 'SIGNED_OUT' || (nextUserId !== null && nextUserId !== prevUserId)) {
        queryClient.clear();
      }

      currentUserIdRef.current = nextUserId;
      setState((prev) => ({
        token: session?.access_token ?? null,
        loading: prev.loading ? false : prev.loading,
      }));
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuthState(): AuthState {
  return useContext(AuthContext);
}

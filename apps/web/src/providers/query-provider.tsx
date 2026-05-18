'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

/**
 * App-wide TanStack Query provider.
 *
 * `useState(() => new QueryClient(...))` ensures ONE client per browser tab.
 * Creating it as a module-level singleton causes hydration cache leaks
 * between users in SSR contexts - `useState`'s lazy initializer pins the
 * client to the React tree's lifetime instead.
 *
 * Defaults rationale:
 *  - `staleTime: 60_000` - most marketplace data (vendors, menus) is fine
 *    when ≤60s old; this stops the over-refetch storm React Query does by
 *    default on every window-focus.
 *  - `retry: 1` - one retry covers transient network blips without making
 *    real failures (e.g. 4xx user errors) take 4× longer to surface.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

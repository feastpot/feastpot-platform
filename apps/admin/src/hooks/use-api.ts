'use client';

import { useCallback } from 'react';

import { apiRequest, ApiError } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

/**
 * Returns a closure-friendly `request` function that always carries the
 * latest Supabase access token. All admin client hooks call through this
 * so we have a single chokepoint for auth headers + error envelopes.
 */
export function useApi() {
  const token = useAccessToken();
  const request = useCallback(
    async <T>(path: string, init: Omit<Parameters<typeof apiRequest>[1], 'accessToken'> = {}) => {
      return apiRequest<T>(path, { ...init, accessToken: token });
    },
    [token],
  );
  return { request, token, ready: token !== null };
}

export { ApiError };

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { createClient } from '@/lib/supabase/client';

/**
 * Self-serve TOTP recovery codes. Plaintext is returned ONCE by the
 * regenerate mutation; status only reports unused/total counts because
 * the API never stores plaintext.
 */
export interface RecoveryCodeStatus {
  remaining: number;
  total: number;
}

const STATUS_KEY = ['mfa', 'recovery-codes', 'status'] as const;

export function useRecoveryCodeStatus(enabled: boolean) {
  const token = useAccessToken();
  return useQuery({
    queryKey: STATUS_KEY,
    enabled: enabled && !!token,
    queryFn: () =>
      apiRequest<RecoveryCodeStatus>('/mfa/recovery-codes/status', { accessToken: token! }),
  });
}

export function useRegenerateRecoveryCodes() {
  const qc = useQueryClient();
  return useMutation({
    // Read a fresh access token from Supabase at call time. The
    // regenerate endpoint requires AAL2: we typically call it right
    // after mfa.verify(), and at that moment React state in
    // useAccessToken may still hold the old AAL1 token. Pulling from
    // supabase.auth.getSession() guarantees we send the rotated AAL2
    // JWT.
    mutationFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) {
        throw new Error('Your session has expired. Please sign in again.');
      }
      return apiRequest<{ codes: string[] }>('/mfa/recovery-codes/regenerate', {
        method: 'POST',
        accessToken: data.session.access_token,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
  });
}

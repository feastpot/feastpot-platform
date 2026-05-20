'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { createClient } from '@/lib/supabase/client';

/**
 * Self-serve TOTP recovery codes. The plaintext list is returned ONCE by
 * the regenerate mutation; status only reports the unused/total counts
 * because the API never stores plaintext.
 */
export interface RecoveryCodeStatus {
  remaining: number;
  total: number;
}

const STATUS_KEY = ['mfa', 'recovery-codes', 'status'] as const;

export function useRecoveryCodeStatus(enabled: boolean) {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: STATUS_KEY,
    enabled: enabled && !!token && !loading,
    queryFn: () =>
      apiRequest<RecoveryCodeStatus>('/mfa/recovery-codes/status', { accessToken: token! }),
  });
}

export function useRegenerateRecoveryCodes() {
  const qc = useQueryClient();
  return useMutation({
    // Read a fresh access token from Supabase at call time. This is
    // important because the regenerate endpoint requires AAL2: the
    // calling page typically invokes this right after mfa.verify(),
    // and at that moment React state in useAccessToken may still hold
    // the old AAL1 token. Pulling from supabase.auth.getSession()
    // guarantees we send the rotated AAL2 JWT.
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

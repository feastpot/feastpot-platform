'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelMyDeletion,
  exportMyData,
  getMe,
  getMyDeletion,
  requestMyDeletion,
  updateMe,
  type AccountDeletionState,
  type UpdateUserInput,
  type UserProfile,
} from '@/lib/api/users';
import { useAccessToken } from '@/lib/auth/use-access-token';

const ME_KEY = ['me'] as const;
const DELETION_KEY = ['me', 'deletion'] as const;

export function useMe() {
  const { token } = useAccessToken();
  return useQuery<UserProfile>({
    queryKey: ME_KEY,
    queryFn: () => getMe(token!),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateMe() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) => {
      if (!token) throw new Error('Not signed in');
      return updateMe(input, token);
    },
    onSuccess: (next) => {
      qc.setQueryData(ME_KEY, next);
      void qc.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

export function useDeleteMe() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'request' | 'cancel') => {
      if (!token) throw new Error('Not signed in');
      return action === 'request' ? requestMyDeletion(token) : cancelMyDeletion(token);
    },
    onSuccess: (state: AccountDeletionState) => qc.setQueryData(DELETION_KEY, state),
  });
}

export function useMyDeletion() {
  const { token } = useAccessToken();
  return useQuery<AccountDeletionState>({
    queryKey: DELETION_KEY,
    queryFn: () => getMyDeletion(token!),
    enabled: Boolean(token),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
}

export function useExportMyData() {
  const { token } = useAccessToken();
  return useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Not signed in');
      return exportMyData(token);
    },
  });
}

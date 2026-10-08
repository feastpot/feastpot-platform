import { apiRequest } from './client';

export interface UserProfile {
  id: string;
  email: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: 'customer' | 'vendor' | 'admin' | 'support' | 'finance' | 'compliance';
  status: 'active' | 'suspended' | 'deleted';
  createdAt: string;
}

export interface UpdateUserInput {
  fullName?: string;
  phone?: string | null;
  avatarUrl?: string;
}

export interface AccountDeletionBlocker {
  code: string;
  message: string;
  count: number;
}

export interface AccountDeletionRequest {
  id: string;
  status: 'requested' | 'cancelled' | 'processing' | 'blocked' | 'completed';
  requestedAt: string;
  eligibleAt: string;
  completedAt: string | null;
  reason: string | null;
}

export interface AccountDeletionState {
  request: AccountDeletionRequest | null;
  blockers: AccountDeletionBlocker[];
  retention: {
    financialYears: 6;
    sellerReportingYears: 5;
    statutoryIdentityException: true;
  };
}

export function getMe(accessToken: string): Promise<UserProfile> {
  return apiRequest<UserProfile>('/users/me', { accessToken });
}

export function updateMe(input: UpdateUserInput, accessToken: string): Promise<UserProfile> {
  return apiRequest<UserProfile>('/users/me', { method: 'PATCH', body: input, accessToken });
}

export function getMyDeletion(accessToken: string): Promise<AccountDeletionState> {
  return apiRequest<AccountDeletionState>('/users/me/deletion', { accessToken, cache: 'no-store' });
}

export function requestMyDeletion(accessToken: string): Promise<AccountDeletionState> {
  return apiRequest<AccountDeletionState>('/users/me/deletion', {
    method: 'POST',
    body: { confirmation: 'DELETE' },
    accessToken,
  });
}

export function cancelMyDeletion(accessToken: string): Promise<AccountDeletionState> {
  return apiRequest<AccountDeletionState>('/users/me/deletion', { method: 'DELETE', accessToken });
}

export function exportMyData(accessToken: string): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>('/users/me/export', {
    accessToken,
    cache: 'no-store',
  });
}

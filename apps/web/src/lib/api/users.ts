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
  phone?: string;
  avatarUrl?: string;
}

export function getMe(accessToken: string): Promise<UserProfile> {
  return apiRequest<UserProfile>('/users/me', { accessToken });
}

export function updateMe(input: UpdateUserInput, accessToken: string): Promise<UserProfile> {
  return apiRequest<UserProfile>('/users/me', { method: 'PATCH', body: input, accessToken });
}

export function deleteMe(accessToken: string): Promise<void> {
  return apiRequest<void>('/users/me', { method: 'DELETE', accessToken });
}

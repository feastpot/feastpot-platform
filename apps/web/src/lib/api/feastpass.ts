import { apiRequest } from './client';

export type FeastPassPlan = 'MONTHLY' | 'ANNUAL';
export type FeastPassStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

export interface FeastPassMembership {
  subscription: {
    id: string;
    plan: FeastPassPlan;
    status: FeastPassStatus;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    startedAt: string;
    cancelledAt: string | null;
  } | null;
  savings: {
    totalSavedPence: number;
    orderCount: number;
  };
}

export async function getFeastPassMembership(token: string): Promise<FeastPassMembership> {
  return apiRequest<FeastPassMembership>('/v1/feastpass/me', { token });
}

export async function createFeastPassCheckout(
  token: string,
  plan: FeastPassPlan,
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string }> {
  return apiRequest<{ url: string }>('/v1/feastpass/checkout', {
    method: 'POST',
    token,
    body: { plan, successUrl, cancelUrl },
  });
}

export async function createFeastPassPortal(
  token: string,
  returnUrl: string,
): Promise<{ url: string }> {
  return apiRequest<{ url: string }>('/v1/feastpass/portal', {
    method: 'POST',
    token,
    body: { returnUrl },
  });
}

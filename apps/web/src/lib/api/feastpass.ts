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

export async function getFeastPassMembership(accessToken: string): Promise<FeastPassMembership> {
  return apiRequest<FeastPassMembership>('/feastpass/me', { accessToken });
}

export async function createFeastPassCheckout(
  accessToken: string,
  plan: FeastPassPlan,
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string }> {
  return apiRequest<{ url: string }>('/feastpass/checkout', {
    method: 'POST',
    accessToken,
    body: { plan, successUrl, cancelUrl },
  });
}

export interface FeastPassSavingsPotential {
  savingsPotentialPence: number;
  orderCount: number;
}

export async function getSavingsPotential(accessToken: string): Promise<FeastPassSavingsPotential> {
  return apiRequest<FeastPassSavingsPotential>('/feastpass/savings-potential', { accessToken });
}

export async function createFeastPassPortal(
  accessToken: string,
  returnUrl: string,
): Promise<{ url: string }> {
  return apiRequest<{ url: string }>('/feastpass/portal', {
    method: 'POST',
    accessToken,
    body: { returnUrl },
  });
}

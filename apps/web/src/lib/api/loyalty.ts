import { apiRequest } from './client';

export type LoyaltyTxType = 'earned' | 'redeemed' | 'expired' | 'adjusted';

export interface LoyaltyEntry {
  id: string;
  type: LoyaltyTxType;
  points: number;
  reason: string | null;
  orderId: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface LoyaltySummary {
  balance: number;
  worthPence: number;
  history: LoyaltyEntry[];
}

export interface ReferralEntry {
  id: string;
  status: 'pending' | 'completed' | 'rewarded';
  rewardPence: number | null;
  completedAt: string | null;
  rewardedAt: string | null;
  createdAt: string;
}

export interface ReferralSummary {
  referralCode: string;
  shareUrl: string;
  referrals: ReferralEntry[];
  totalEarnedPence: number;
}

export function getLoyalty(accessToken: string): Promise<LoyaltySummary> {
  return apiRequest<LoyaltySummary>('/loyalty-points', { accessToken });
}

export function getReferrals(accessToken: string): Promise<ReferralSummary> {
  return apiRequest<ReferralSummary>('/referrals', { accessToken });
}

export interface AccountDeletionState {
  request: {
    id: string;
    status: 'requested' | 'cancelled' | 'processing' | 'blocked' | 'completed';
    requestedAt: string;
    eligibleAt: string;
    completedAt: string | null;
    reason: string | null;
  } | null;
  blockers: Array<{ code: string; message: string; count: number }>;
  retention: {
    financialYears: 6;
    sellerReportingYears: 5;
    statutoryIdentityException: true;
  };
}

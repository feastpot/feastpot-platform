import type {
  DisputeIssueType,
  DisputeSeverity,
  DisputeStatus,
} from '@/hooks/use-disputes';

export const STATUS_LABEL: Record<DisputeStatus, string> = {
  open: 'Open',
  vendor_contacted: 'Vendor responded',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const STATUS_BADGE: Record<DisputeStatus, string> = {
  open: 'bg-amber-100 text-amber-800',
  vendor_contacted: 'bg-teal-light text-teal-dark',
  escalated: 'bg-red-100 text-red-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-surface text-mid',
};

export const SEVERITY_LABEL: Record<DisputeSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const SEVERITY_BADGE: Record<DisputeSeverity, string> = {
  low: 'bg-surface text-mid',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-700',
};

export const ISSUE_TYPE_LABEL: Record<DisputeIssueType, string> = {
  not_delivered: 'Not delivered',
  missing_items: 'Missing items',
  wrong_order: 'Wrong order',
  quality: 'Quality issue',
  other: 'Other',
};

/**
 * Responses are locked once a dispute is escalated or terminal
 * (resolved/closed). The vendor-response form is disabled in these states.
 */
export function isResponseLocked(status: DisputeStatus): boolean {
  return status === 'escalated' || status === 'resolved' || status === 'closed';
}

export function lockNotice(status: DisputeStatus): string | null {
  switch (status) {
    case 'escalated':
      return 'This dispute has been escalated to the Feastpot team. Vendor responses are locked while it is under review.';
    case 'resolved':
      return 'This dispute has been resolved. No further vendor response is required.';
    case 'closed':
      return 'This dispute is closed. You can no longer submit a response.';
    default:
      return null;
  }
}

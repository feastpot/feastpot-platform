/**
 * Dispute SLA age helper.
 *
 * Spec (D15):
 *  - 24h acknowledgement SLA - vendor must respond to a new dispute within 24h.
 *  - 5-day resolution SLA - dispute must reach `resolved`/`closed` within 120h.
 *  - Warn at 4 days (96h) so it appears on the radar before it actually breaches.
 *
 * Note: the spec called the ack timestamp `acknowledgedAt`, but the Prisma
 * `Dispute` model stores it as `vendorRespondedAt` (the moment the vendor
 * first replied to the customer). Same semantic, different name - callers
 * pass `vendorRespondedAt` here.
 */
export type SLATone = 'neutral' | 'warn' | 'breach' | 'resolved';

export interface SLAStatus {
  label: string;
  tone: SLATone;
  /** True when the indicator should pulse and sort to the top of the list. */
  urgent: boolean;
}

const HOUR_MS = 60 * 60 * 1000;

export function getSLAStatus(
  createdAt: string,
  vendorRespondedAt?: string | null,
  resolvedAt?: string | null,
): SLAStatus {
  if (resolvedAt) {
    return { label: 'Resolved', tone: 'resolved', urgent: false };
  }

  const ageHours = (Date.now() - new Date(createdAt).getTime()) / HOUR_MS;

  if (!vendorRespondedAt && ageHours > 24) {
    return { label: `${Math.floor(ageHours)}h - ACK overdue`, tone: 'breach', urgent: true };
  }
  if (ageHours > 120) {
    return { label: `${Math.floor(ageHours / 24)}d - resolution overdue`, tone: 'breach', urgent: true };
  }
  if (ageHours > 96) {
    return { label: `${Math.floor(ageHours / 24)}d - closing SLA`, tone: 'warn', urgent: true };
  }
  return { label: `${Math.floor(ageHours)}h open`, tone: 'neutral', urgent: false };
}

export const SLA_TONE_CLASSES: Record<SLATone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  warn: 'bg-amber-100 text-amber-900',
  breach: 'bg-red-100 text-red-900',
  resolved: 'bg-teal-light text-teal-dark',
};

import type { DocumentStatus, VendorDocument, VendorDocumentType } from '@/hooks/use-vendor-documents';

/**
 * Spec-level compliance statuses surfaced to the vendor. These extend the raw
 * DB enum (`pending | verified | rejected | expired`) with two derived
 * states the vendor cares about most:
 *
 *  - `expiring_soon`: doc is currently verified but `expiresAt` falls within
 *    EXPIRY_WARNING_DAYS. Matches the API cron that emails the vendor.
 *  - `not_started`: no document of this type has been uploaded yet.
 *
 * `suspended` is a vendor-account state (not per-doc), surfaced separately
 * on the page banner rather than per row.
 */
export type ComplianceState =
  | 'not_started'
  | 'submitted'
  | 'approved'
  | 'needs_changes'
  | 'expiring_soon'
  | 'expired';

/** Mirrors apps/api/.../compliance.service.ts EXPIRY_WARNING_DAYS. */
export const EXPIRY_WARNING_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from `now` until `iso`. Negative if already passed. */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - now.getTime()) / MS_PER_DAY);
}

/**
 * Derive the spec-level state for a single document slot.
 *
 * Rules (priority order):
 *  1. No doc uploaded                       -> not_started
 *  2. DB status = rejected                  -> needs_changes
 *  3. DB status = expired                   -> expired
 *  4. DB status = pending                   -> submitted
 *  5. DB status = verified + expiresAt past -> expired
 *  6. DB status = verified + within 30 days -> expiring_soon
 *  7. Otherwise                             -> approved
 */
export function deriveComplianceState(
  doc: VendorDocument | undefined | null,
  now: Date = new Date(),
): ComplianceState {
  if (!doc) return 'not_started';
  const status: DocumentStatus = doc.status;
  if (status === 'rejected') return 'needs_changes';
  if (status === 'expired') return 'expired';
  if (status === 'pending') return 'submitted';
  // status === 'verified'
  const days = daysUntil(doc.expiresAt, now);
  if (days !== null && days < 0) return 'expired';
  if (days !== null && days <= EXPIRY_WARNING_DAYS) return 'expiring_soon';
  return 'approved';
}

export interface ComplianceStateMeta {
  label: string;
  /** Tailwind colour family aligned with FeastPot tokens. */
  tone: 'gray' | 'vendor' | 'teal' | 'amber' | 'red';
  /** Short description shown next to the badge. */
  hint: string;
}

export const COMPLIANCE_STATE_META: Record<ComplianceState, ComplianceStateMeta> = {
  not_started: { label: 'Not started', tone: 'gray', hint: 'Upload required' },
  submitted: { label: 'Submitted', tone: 'vendor', hint: 'Awaiting review' },
  approved: { label: 'Approved', tone: 'teal', hint: 'In good standing' },
  needs_changes: { label: 'Needs changes', tone: 'red', hint: 'Re-upload required' },
  expiring_soon: { label: 'Expiring soon', tone: 'amber', hint: 'Replace before expiry' },
  expired: { label: 'Expired', tone: 'red', hint: 'No longer valid' },
};

/**
 * Build a compact summary of the vendor's compliance posture, suitable for
 * the dashboard alert widget.
 */
export interface ComplianceSummary {
  totalRequired: number;
  notStarted: number;
  submitted: number;
  approved: number;
  needsChanges: number;
  expiringSoon: number;
  expired: number;
  /**
   * The single worst state across the vendor's required slots, used to set
   * the alert widget's banner colour. `approved` is the "all good" sentinel.
   */
  worst: ComplianceState;
  /** Per-type derived state for surfacing inline lists. */
  byType: Array<{ type: VendorDocumentType; state: ComplianceState; doc: VendorDocument | null }>;
}

/** Priority used to pick `worst` and to sort the dashboard list. */
const STATE_SEVERITY: Record<ComplianceState, number> = {
  expired: 6,
  needs_changes: 5,
  expiring_soon: 4,
  not_started: 3,
  submitted: 2,
  approved: 1,
};

export function summarise(
  requiredTypes: readonly VendorDocumentType[],
  docs: readonly VendorDocument[] | undefined,
  now: Date = new Date(),
): ComplianceSummary {
  // Pick the most-recent doc per type. The API already orders by createdAt
  // desc so the first occurrence wins.
  const byType = new Map<VendorDocumentType, VendorDocument>();
  for (const d of docs ?? []) if (!byType.has(d.type)) byType.set(d.type, d);

  const rows = requiredTypes.map((type) => {
    const doc = byType.get(type) ?? null;
    return { type, state: deriveComplianceState(doc, now), doc };
  });

  const counts: Record<ComplianceState, number> = {
    not_started: 0,
    submitted: 0,
    approved: 0,
    needs_changes: 0,
    expiring_soon: 0,
    expired: 0,
  };
  for (const r of rows) counts[r.state] += 1;

  const worst = rows.reduce<ComplianceState>(
    (acc, r) => (STATE_SEVERITY[r.state] > STATE_SEVERITY[acc] ? r.state : acc),
    'approved',
  );

  return {
    totalRequired: requiredTypes.length,
    notStarted: counts.not_started,
    submitted: counts.submitted,
    approved: counts.approved,
    needsChanges: counts.needs_changes,
    expiringSoon: counts.expiring_soon,
    expired: counts.expired,
    worst,
    byType: rows.sort((a, b) => STATE_SEVERITY[b.state] - STATE_SEVERITY[a.state]),
  };
}

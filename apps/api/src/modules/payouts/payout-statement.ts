import { PayoutStatus } from '@prisma/client';

export type PayoutStatementEntryKind = 'order' | 'catering';

export interface PayoutStatementEntryInput {
  id: string;
  kind: PayoutStatementEntryKind;
  reference: string;
  occurredAt: string | null;
  source: string | null;
  effectiveCommissionRatePercent: string | null;
  grossPence: number;
  foodSubtotalPence: number;
  commissionPence: number;
  serviceFeesPence: number | null;
  refundsPence: number;
  chargebacksPence: number;
  vendorPayoutBeforeDeductionsPence: number;
}

export interface PayoutStatementEntry extends PayoutStatementEntryInput {
  adjustmentsPence: number | null;
  netPence: number;
}

export interface PayoutStatementSummary {
  grossSalesPence: number;
  commissionPence: number;
  refundsPence: number;
  chargebacksPence: number;
  serviceFeesPence: number | null;
  adjustmentsPence: number | null;
  netPayoutPence: number;
  openingBalancePence: number;
  rawNetPayoutPence: number;
  closingBalancePence: number;
  entryCount: number;
}

export interface PayoutStatement {
  version: 1;
  vendorId: string;
  vendorBusinessName: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  status: PayoutStatus;
  holdReason: string | null;
  entries: PayoutStatementEntry[];
  summary: PayoutStatementSummary;
}

export interface BuildPayoutStatementInput {
  vendorId: string;
  vendorBusinessName: string;
  periodStart: Date;
  periodEnd: Date;
  currency?: string;
  hasOpenDispute: boolean;
  entries: PayoutStatementEntryInput[];
}

/**
 * Canonical payout arithmetic. Every amount is integer pence.
 *
 * `null` means unavailable and is deliberately contagious for a derived line:
 * callers must render "not available", never a guessed zero.
 */
export function buildPayoutStatement(input: BuildPayoutStatementInput): PayoutStatement {
  const entries = input.entries.map<PayoutStatementEntry>((entry) => {
    const deductionsPence = entry.refundsPence + entry.chargebacksPence;
    const netPence = entry.vendorPayoutBeforeDeductionsPence - deductionsPence;
    const adjustmentsPence =
      entry.serviceFeesPence === null
        ? null
        : netPence -
          (entry.grossPence -
            entry.commissionPence -
            entry.serviceFeesPence -
            entry.refundsPence -
            entry.chargebacksPence);
    return { ...entry, adjustmentsPence, netPence };
  });

  const serviceFeesAvailable = entries.every((entry) => entry.serviceFeesPence !== null);
  const adjustmentsAvailable = entries.every((entry) => entry.adjustmentsPence !== null);
  const summary: PayoutStatementSummary = {
    grossSalesPence: entries.reduce((sum, entry) => sum + entry.grossPence, 0),
    commissionPence: entries.reduce((sum, entry) => sum + entry.commissionPence, 0),
    refundsPence: entries.reduce((sum, entry) => sum + entry.refundsPence, 0),
    chargebacksPence: entries.reduce((sum, entry) => sum + entry.chargebacksPence, 0),
    serviceFeesPence: serviceFeesAvailable
      ? entries.reduce((sum, entry) => sum + (entry.serviceFeesPence ?? 0), 0)
      : null,
    adjustmentsPence: adjustmentsAvailable
      ? entries.reduce((sum, entry) => sum + (entry.adjustmentsPence ?? 0), 0)
      : null,
    netPayoutPence: entries.reduce((sum, entry) => sum + entry.netPence, 0),
    openingBalancePence: 0,
    rawNetPayoutPence: entries.reduce((sum, entry) => sum + entry.netPence, 0),
    closingBalancePence: 0,
    entryCount: entries.length,
  };

  if (summary.serviceFeesPence !== null && summary.adjustmentsPence !== null) {
    const reconciled =
      summary.grossSalesPence -
      summary.commissionPence -
      summary.refundsPence -
      summary.chargebacksPence -
      summary.serviceFeesPence +
      summary.adjustmentsPence;
    if (reconciled !== summary.netPayoutPence) {
      throw new Error(
        `Payout statement does not reconcile: calculated ${reconciled}, net ${summary.netPayoutPence}`,
      );
    }
  }

  return {
    version: 1,
    vendorId: input.vendorId,
    vendorBusinessName: input.vendorBusinessName,
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    currency: input.currency ?? 'GBP',
    status: input.hasOpenDispute ? PayoutStatus.held : PayoutStatus.draft,
    holdReason: input.hasOpenDispute ? 'Vendor has open dispute(s); held pending resolution' : null,
    entries,
    summary,
  };
}

export function applyPayoutCarryForward(
  statement: PayoutStatement,
  openingBalancePence: number,
): PayoutStatement {
  const opening = Math.min(0, openingBalancePence);
  const rawNet = statement.entries.reduce((sum, entry) => sum + entry.netPence, 0);
  const combined = opening + rawNet;
  const transferable = Math.max(0, combined);
  const closing = Math.min(0, combined);
  const heldForDebt = transferable === 0 && closing < 0;
  return {
    ...statement,
    status: heldForDebt ? PayoutStatus.held : statement.status,
    holdReason: heldForDebt
      ? `Negative vendor balance of ${Math.abs(closing)}p carried forward`
      : statement.holdReason,
    summary: {
      ...statement.summary,
      openingBalancePence: opening,
      rawNetPayoutPence: rawNet,
      netPayoutPence: transferable,
      closingBalancePence: closing,
    },
  };
}

export function isPayoutStatement(value: unknown): value is PayoutStatement {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PayoutStatement>;
  return candidate.version === 1 && Array.isArray(candidate.entries) && !!candidate.summary;
}

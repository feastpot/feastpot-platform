export const MINIMUM_CATERING_QUOTE_PENCE = 5_000;
export const CATERING_DEPOSIT_PERCENT = 25;

export interface CateringDepositBreakdown {
  totalPence: number;
  minimumDepositPence: number;
  depositPence: number;
  balancePence: number;
}

export class CateringDepositPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CateringDepositPolicyError';
  }
}

export function assertCateringDepositInvariant(
  totalPence: number,
  depositPence: number,
  balancePence: number,
): void {
  if (depositPence + balancePence !== totalPence || balancePence < 0) {
    throw new CateringDepositPolicyError(
      'Catering deposit and balance do not reconcile with the quote total',
    );
  }
}

function assertMoneyPence(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CateringDepositPolicyError(`${label} must be a non-negative integer number of pence`);
  }
}

/**
 * Canonical catering deposit policy.
 *
 * Quotes must total at least £50. The deposit is the greater of 25% (rounded
 * up to the next penny) and the vendor's cash minimum, capped at the quote
 * total. Every returned breakdown is reconciled before it leaves this function.
 */
export function calculateCateringDeposit(
  totalPence: number,
  minimumDepositPence: number,
  options: { enforceMinimumQuote?: boolean } = {},
): CateringDepositBreakdown {
  assertMoneyPence(totalPence, 'Quote total');
  assertMoneyPence(minimumDepositPence, 'Minimum deposit');

  if (options.enforceMinimumQuote !== false && totalPence < MINIMUM_CATERING_QUOTE_PENCE) {
    throw new CateringDepositPolicyError('Catering quote total must be at least £50.00');
  }

  const wholePoundsDeposit = Math.floor(totalPence / 100) * CATERING_DEPOSIT_PERCENT;
  const remainingPenceDeposit = Math.floor(
    ((totalPence % 100) * CATERING_DEPOSIT_PERCENT + 99) / 100,
  );
  const percentageDepositPence = wholePoundsDeposit + remainingPenceDeposit;
  const depositPence = Math.min(totalPence, Math.max(percentageDepositPence, minimumDepositPence));
  const balancePence = totalPence - depositPence;

  assertCateringDepositInvariant(totalPence, depositPence, balancePence);

  return { totalPence, minimumDepositPence, depositPence, balancePence };
}

/** Preserve the historical event-quote percentage rule for quotes already issued. */
export function calculateLegacyEventDeposit(totalPence: number, depositPercent: number): number {
  assertMoneyPence(totalPence, 'Quote total');
  if (!Number.isSafeInteger(depositPercent) || depositPercent < 0 || depositPercent > 100) {
    throw new CateringDepositPolicyError(
      'Legacy deposit percentage must be an integer from 0 to 100',
    );
  }

  const wholePoundsDeposit = Math.floor(totalPence / 100) * depositPercent;
  const remainderNumerator = (totalPence % 100) * depositPercent;
  const remainingPenceDeposit = Math.floor((remainderNumerator + 50) / 100);
  const depositPence = Math.min(
    totalPence,
    Math.max(50, wholePoundsDeposit + remainingPenceDeposit),
  );
  assertCateringDepositInvariant(totalPence, depositPence, totalPence - depositPence);
  return depositPence;
}

/**
 * Maximum quote expiry: the earlier of seven days from now and 48 hours
 * before the event.
 */
export function calculateCateringQuoteExpiry(eventDate: Date, now = new Date()): Date {
  if (Number.isNaN(eventDate.getTime())) {
    throw new CateringDepositPolicyError('Invalid event date');
  }

  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
  const fortyEightHoursBeforeEvent = new Date(eventDate.getTime() - 48 * 60 * 60 * 1_000);
  return sevenDays < fortyEightHoursBeforeEvent ? sevenDays : fortyEightHoursBeforeEvent;
}

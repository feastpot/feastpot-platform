'use strict';
// CJS runtime entry for @feastpot/config/catering-deposit.
// Generated from catering-deposit.ts - keep in sync when the policy changes.

const MINIMUM_CATERING_QUOTE_PENCE = 5000;
const CATERING_DEPOSIT_PERCENT = 25;

class CateringDepositPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CateringDepositPolicyError';
  }
}

function assertMoneyPence(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CateringDepositPolicyError(`${label} must be a non-negative integer number of pence`);
  }
}

function assertCateringDepositInvariant(totalPence, depositPence, balancePence) {
  if (depositPence + balancePence !== totalPence || balancePence < 0) {
    throw new CateringDepositPolicyError(
      'Catering deposit and balance do not reconcile with the quote total',
    );
  }
}

function calculateCateringDeposit(totalPence, minimumDepositPence, options = {}) {
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

function calculateLegacyEventDeposit(totalPence, depositPercent) {
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

function calculateCateringQuoteExpiry(eventDate, now = new Date()) {
  if (Number.isNaN(eventDate.getTime())) {
    throw new CateringDepositPolicyError('Invalid event date');
  }
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fortyEightHoursBeforeEvent = new Date(eventDate.getTime() - 48 * 60 * 60 * 1000);
  return sevenDays < fortyEightHoursBeforeEvent ? sevenDays : fortyEightHoursBeforeEvent;
}

exports.MINIMUM_CATERING_QUOTE_PENCE = MINIMUM_CATERING_QUOTE_PENCE;
exports.CATERING_DEPOSIT_PERCENT = CATERING_DEPOSIT_PERCENT;
exports.CateringDepositPolicyError = CateringDepositPolicyError;
exports.assertCateringDepositInvariant = assertCateringDepositInvariant;
exports.calculateCateringDeposit = calculateCateringDeposit;
exports.calculateLegacyEventDeposit = calculateLegacyEventDeposit;
exports.calculateCateringQuoteExpiry = calculateCateringQuoteExpiry;

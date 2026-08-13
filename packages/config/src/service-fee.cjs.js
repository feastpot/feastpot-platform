'use strict';
// CJS runtime entry for @feastpot/config/service-fee.
// Generated from service-fee.ts - keep in sync when formula changes.
const { PLATFORM_FACTS } = require('./platform-facts.cjs.js');

function computeServiceFeePence(subtotalPence) {
  if (subtotalPence <= 0) return 0;
  const { percent, capPence } = PLATFORM_FACTS.serviceFee;
  return Math.min(Math.round((subtotalPence * percent) / 100), capPence);
}

exports.computeServiceFeePence = computeServiceFeePence;

/**
 * CJS mirror of shouldWaiveServiceFee from service-fee.ts.
 * Keep in sync when the waiver logic changes.
 * @param {boolean} hasActiveFeastPass
 * @param {string|null} attributionSource
 * @returns {boolean}
 */
function shouldWaiveServiceFee(hasActiveFeastPass, attributionSource) {
  if (!hasActiveFeastPass) return false;
  if (!attributionSource) return false;
  return attributionSource !== 'VENDOR_REFERRED';
}
exports.shouldWaiveServiceFee = shouldWaiveServiceFee;

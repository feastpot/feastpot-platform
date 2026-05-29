/**
 * Platform service fee, read from `SERVICE_FEE_BPS` at call time so the fee can
 * change via env without a code deploy. Single source of truth shared by order
 * pricing (`orders.service`) and the public vendor profile (`vendors.service`),
 * so the customer-facing express-checkout total can never drift from the amount
 * actually charged. Defaults to 0 (launch config); any unparseable or negative
 * value also yields 0 so a misconfigured env can never charge an unintended fee.
 */
export function getServiceFeeBps(): number {
  const bps = Number.parseInt(process.env.SERVICE_FEE_BPS ?? '0', 10);
  if (!Number.isFinite(bps) || bps < 0) return 0;
  return bps;
}

export function getServiceFeePence(subtotalPence: number): number {
  return Math.round((subtotalPence * getServiceFeeBps()) / 10_000);
}

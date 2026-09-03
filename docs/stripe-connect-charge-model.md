# Stripe Connect charge model

## Model in use

Feastpot uses **separate charges and transfers**.

1. The customer pays a platform-owned Stripe PaymentIntent for the full customer total.
2. The PaymentIntent is captured on Feastpot's platform account.
3. After delivery and financial adjustments, the weekly payout process builds and persists
   one canonical payout statement.
4. Approval creates a separate Stripe Transfer to the vendor's Express connected account
   for exactly the persisted payout amount.

The PaymentIntent does **not** use `application_fee_amount`, `transfer_data.destination`,
`on_behalf_of`, or connected-account request options. Feastpot therefore does not encode a
commission percentage or application fee in the customer charge.

## How commission reaches Stripe

Commission is resolved when the order is created from the effective-dated commission rate
for that order's attribution source. Integer-pence commission and vendor-payout amounts are
stored on the order, with immutable rate provenance in `OrderCommission`.

The weekly payout statement consumes those stored order economics along with refunds,
chargebacks, service fees, and adjustments. Stripe receives only the final, reconciled
`Payout.amountPence` in a separate Transfer. The transfer API call must never recompute a
rate.

For a vendor-referred order whose resolved commission is 0%, no zero application fee is
sent to Stripe because this model has no application fee. The full commissionable food
subtotal remains in the vendor's local earnings, subject to delivery, discounts, refunds,
chargebacks, adjustments, and payout debt. The customer service fee remains platform
revenue and is not transferred to the vendor.

## Refunds and chargebacks

Refund allocation uses the original order's stored `commissionPence`; it does not resolve
the current rate. A partial refund on an order from an older rate window therefore reverses
the vendor/platform split proportionally using the historical order economics.

Manual refunds and lost chargebacks both use the shared cumulative refund-ledger writer and
incremental split function. This keeps their vendor clawback and platform-absorbed amounts
consistent and prevents cumulative refunds from exceeding the original customer payment.

## Reconciliation

The hourly financial reconciliation compares:

- Stripe captures with local captured payments.
- Stripe refunds with local refund payments.
- Stripe Transfers with the persisted `Payout.amountPence`.
- Local order arithmetic and `OrderCommission` provenance.

There is intentionally no application-fee reconciliation because Feastpot does not create
Stripe application fees. A Stripe Transfer divergence is flagged against the persisted
payout, whose immutable statement contains the underlying commission and adjustment detail.

## Unaffected Stripe configuration

This architecture does not change:

- FeastPass subscription pricing or Stripe Price IDs.
- The separate customer service-fee calculation or FeastPass waiver.
- Stripe's own card-processing fees.
- Express connected-account capabilities or onboarding.
- Stripe account payout schedules.
- The Monday 02:00 UTC Feastpot batch schedule.

## Operational verification

Before relying on a new effective rate in production, place one test-mode order for each
marketplace-first, marketplace-repeat, and vendor-referred source. Deliver the orders, run
and approve the resulting test payout, then verify in Stripe that:

- Each PaymentIntent is a platform charge with no application fee or destination.
- Each vendor Transfer matches the canonical payout statement to the penny.
- The vendor-referred order contributes zero commission while its customer service fee
  remains platform revenue.

Record the Stripe object IDs and local order/payout IDs in the private operational evidence
store, not in this repository.

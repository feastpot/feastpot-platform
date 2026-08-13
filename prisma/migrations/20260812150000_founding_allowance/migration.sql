-- Founding offer: commission-free GMV allowance for new vendors (Prompt 19).
--
-- foundingAllowanceGrantedPence default 200000 must match
-- PLATFORM_FACTS.foundingOffer.commissionFreeGmvPence (asserted in platform-facts.spec.ts).
--
-- referredByVendorId: set at application/approval time when a vendor referral
-- link slug is supplied; drives the referral top-up on first completed order.
--
-- foundingReferralBonusGrantedAt: set when the referred vendor's first completed
-- order triggers the referrer's top-up, so the top-up cannot fire twice.

ALTER TABLE vendors
  ADD COLUMN founding_allowance_granted_pence INT NOT NULL DEFAULT 200000,
  ADD COLUMN founding_allowance_used_pence    INT NOT NULL DEFAULT 0,
  ADD COLUMN referred_by_vendor_id            UUID,
  ADD COLUMN founding_referral_bonus_granted_at TIMESTAMPTZ;

-- foundingAllowanceAppliedPence: pence of food subtotal this order covered
-- via the vendor's founding allowance (0% commission band). Used to restore
-- allowance on refund proportionally.
ALTER TABLE orders
  ADD COLUMN founding_allowance_applied_pence INT NOT NULL DEFAULT 0;

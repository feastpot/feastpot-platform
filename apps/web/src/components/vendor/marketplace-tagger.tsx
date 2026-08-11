'use client';

import { useEffect } from 'react';

interface MarketplaceTaggerProps {
  /** UUID of the vendor being viewed. Used as the cookie/localStorage key. */
  vendorId: string;
}

/** 90 days in seconds. */
const MARKETPLACE_MARKER_MAX_AGE = 90 * 24 * 60 * 60;

/**
 * Sets a MARKETPLACE attribution marker for the current vendor on mount.
 *
 * When a customer browses to a vendor page via Feastpot's postcode search
 * (not via the vendor's own referral link), this component marks that visit
 * so the attribution system can credit the platform rather than a vendor
 * referral click if the customer places an order later.
 *
 * The marker is stored in two places:
 *   1. Cookie `fp_mp_{vendorId}`: readable server-side by /v/[slug] to
 *      enforce the override rule (marketplace beats vendor within 90 days).
 *   2. localStorage `fp_mp_{vendorId}`: fallback for environments that
 *      block cookies; read by the checkout hook as X-Fp-Mktplace.
 *
 * This is a zero-render component; it returns null and only fires an effect.
 * Mount it inside any Server Component and the effect runs after hydration.
 */
export function MarketplaceTagger({ vendorId }: MarketplaceTaggerProps) {
  useEffect(() => {
    const key = `fp_mp_${vendorId}`;
    const ts = String(Date.now());
    try {
      // Cookie (server-readable for /v/[slug] override check)
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${key}=${ts}; Path=/; Max-Age=${MARKETPLACE_MARKER_MAX_AGE}; SameSite=Lax${secure}`;
    } catch {
      // Cookie write failed (e.g. restrictive browser); localStorage fallback below.
    }
    try {
      localStorage.setItem(key, ts);
    } catch {
      // Private browsing or storage quota exceeded: no-op.
    }
  }, [vendorId]);

  return null;
}

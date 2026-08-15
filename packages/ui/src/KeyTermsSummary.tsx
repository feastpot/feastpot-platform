import * as React from 'react';

/**
 * Layer 1 of the three-layer legal presentation (P2B Regulation).
 *
 * Source: Annex C of the Feastpot Vendor Terms of Agreement.
 * Purpose: a plain-language signpost to help vendors understand the key
 * commercial and legal points before they read the full agreement.
 *
 * MANDATORY DISCLAIMER: The signpost label below MUST appear visibly on
 * every render, NOT in small print. It is required under P2B Regulation
 * because a summary that appears to be the contract is worse than no
 * summary. The disclaimer must be present, readable, and styled at
 * comparable size to the bullets.
 *
 * DO NOT:
 *   - Omit the disclaimer or move it below the fold.
 *   - Style the disclaimer in a colour that fails WCAG 2.2 AA contrast.
 *   - Present this component as a substitute for the full terms.
 *   - Add a "by continuing you agree" wrapper around this component alone.
 */

const KEY_TERMS: string[] = [
  'You are an independent business, not an employee of Feastpot. You set your own menu, prices, delivery area, and minimum order.',
  'Commission is charged on the food subtotal of completed orders only. It is never charged on delivery fees, service charges, or tips.',
  'The current commission rates are listed in the Rate Schedule (Annex A). Rates may change with at least 15 days notice under UK P2B Regulation.',
  'When you accept an order it becomes a binding contract between you and the customer. Only accept orders you can fulfil.',
  'Feastpot holds customer payments and pays your earnings every Monday after delivery is confirmed.',
  'You are responsible for food safety, hygiene registration, allergen labelling, and compliance with food law.',
  'You can end this agreement with 30 days written notice at any time. If Feastpot makes a material change to the terms, you can leave without penalty before the change takes effect.',
  'Feastpot may suspend or deactivate your account for safety concerns, fraud, or a serious breach of these terms. We will give reasons and offer a right to appeal.',
  'Disputes are handled through a two-stage review. Chargebacks from customers are deducted from your next payout, after the outcome of any investigation.',
  'Feastpot may promote, rank, or restrict your listing based on customer ratings, order acceptance rate, compliance status, and platform policies. The ranking factors are disclosed in the full terms.',
];

interface KeyTermsSummaryProps {
  /** Tailwind class(es) to add to the outer wrapper. Useful for margin overrides. */
  className?: string;
}

export function KeyTermsSummary({ className = '' }: KeyTermsSummaryProps) {
  return (
    <section
      aria-label="Key Terms Summary (plain language)"
      className={`rounded-2xl border border-amber-200 bg-amber-50 p-5 ${className}`}
    >
      {/* ── Mandatory signpost disclaimer ───────────────────────────────────
          Must be visible, not in small print, on every render.
          Do not move this below the bullets or reduce its visual weight.    */}
      <p className="mb-4 rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-[13px] font-semibold leading-snug text-amber-900">
        This plain language summary is a signpost only. It is not the contract. Where this summary
        and the numbered terms differ, the numbered terms apply.
      </p>

      <h3 className="mb-3 text-[13px] font-black uppercase tracking-[0.1em] text-amber-900">
        Key terms at a glance (Annex C)
      </h3>

      <ol className="space-y-2.5">
        {KEY_TERMS.map((term, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-200 text-[11px] font-black text-amber-900"
            >
              {i + 1}
            </span>
            <p className="text-[13px] leading-snug text-amber-800">{term}</p>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-[12px] text-amber-700">
        Read the full{' '}
        <a
          href="https://feastpot.co.uk/legal/vendor-terms"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-2 hover:text-amber-900"
        >
          Vendor Terms of Agreement
        </a>
        , including the Rate Schedule (Annex A) and the full list of clauses, before signing.
      </p>
    </section>
  );
}

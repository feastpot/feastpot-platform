/**
 * VerificationPanel - customer-facing verification evidence block.
 *
 * Renders on every vendor profile above the menu. Every row is always shown:
 * blank states are replaced by explicit status text so customers can
 * distinguish "not yet inspected" from "data unavailable".
 *
 * NON-MONETISATION: This component must never conditionally render based on
 * subscription status, placement tier, or any paid product. See
 * VERIFICATION_IS_NEVER_MONETISED in apps/api/src/config/pricing.ts.
 */

import React from 'react';

export type FhrsStatus = 'AWAITING_FIRST_INSPECTION' | 'RATED' | 'EXEMPT' | 'NOT_FOUND';

export type VerificationState = 'VERIFIED' | 'RENEWAL_DUE' | 'SUSPENDED';

export interface VerificationData {
  registrationNumber: string;
  registrationAuthority: string;
  registrationConfirmedAt: string | Date;
  fhrsRating: number | null;
  fhrsRatingCheckedAt: string | Date | null;
  fhrsInspectionStatus: FhrsStatus;
  insuranceProvider: string | null;
  insuranceValidUntil: string | Date | null;
  allergenTrainingHeld: boolean;
  allergenTrainingUntil: string | Date | null;
  idVerifiedAt: string | Date | null;
  overallState: VerificationState;
}

export interface VerificationPanelProps {
  verification: VerificationData;
  reviewCount?: number;
  /** Base URL of the app (e.g. https://feastpot.co.uk). Defaults to empty string (relative). */
  baseUrl?: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const parsed = typeof d === 'string' ? new Date(d) : d;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className ?? 'h-4 w-4'}>
      <circle cx="8" cy="8" r="8" fill="#00843D" />
      <path
        d="M4.5 8l2.5 2.5 4.5-5"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className ?? 'h-4 w-4'}>
      <circle cx="8" cy="8" r="7" stroke="#D97706" strokeWidth="1.5" />
      <path d="M8 4.5V8l2.5 2" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className ?? 'h-4 w-4'}>
      <circle cx="8" cy="8" r="7" stroke="#DC2626" strokeWidth="1.5" />
      <path d="M8 4.5v4M8 10.5h.01" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InfoTooltip({ tip }: { tip: string }) {
  return (
    <span
      title={tip}
      aria-label={tip}
      className="ml-1 inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-charcoal/20 text-[9px] font-bold text-charcoal-mid"
    >
      ?
    </span>
  );
}

interface RowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tooltip: string;
}

function Row({ icon, label, value, tooltip }: RowProps) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center">
          <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-charcoal-mid">
            {label}
          </span>
          <InfoTooltip tip={tooltip} />
        </div>
        <div className="mt-0.5 text-[14px] font-medium leading-snug text-charcoal">{value}</div>
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export function VerificationPanel({
  verification: v,
  reviewCount,
  baseUrl = '',
}: VerificationPanelProps) {
  const stateColour =
    v.overallState === 'VERIFIED'
      ? 'bg-brand/10 text-brand-dark border-brand/20'
      : v.overallState === 'RENEWAL_DUE'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-red-50 text-red-700 border-red-200';

  const stateLabel =
    v.overallState === 'VERIFIED'
      ? 'Verified'
      : v.overallState === 'RENEWAL_DUE'
        ? 'Renewal due'
        : 'Suspended';

  // ── hygiene rating row ───────────────────────────────────────────────────
  let hygieneValue: React.ReactNode;
  let hygieneIcon: React.ReactNode;

  if (v.fhrsInspectionStatus === 'AWAITING_FIRST_INSPECTION') {
    hygieneIcon = <ClockIcon />;
    hygieneValue = (
      <>
        Registered with {v.registrationAuthority} on {fmtDate(v.registrationConfirmedAt)}. Awaiting
        first hygiene inspection.
      </>
    );
  } else if (v.fhrsInspectionStatus === 'EXEMPT') {
    hygieneIcon = <CheckIcon />;
    hygieneValue = <>Exempt from FHRS rating (low-risk premises).</>;
  } else if (v.fhrsInspectionStatus === 'NOT_FOUND') {
    hygieneIcon = <ClockIcon />;
    hygieneValue = (
      <>
        Rating lookup pending. Last checked: {fmtDate(v.fhrsRatingCheckedAt) || 'not yet checked'}.
      </>
    );
  } else {
    // RATED
    const score = v.fhrsRating;
    const checkedStr = v.fhrsRatingCheckedAt ? `Checked ${fmtDate(v.fhrsRatingCheckedAt)}.` : '';
    if (score !== null && score >= 3) {
      hygieneIcon = <CheckIcon />;
      hygieneValue = (
        <>
          {score}/5 -{' '}
          <a
            href="https://ratings.food.gov.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-brand"
          >
            View on FSA
          </a>
          {checkedStr ? ` ${checkedStr}` : ''}
        </>
      );
    } else if (score !== null) {
      hygieneIcon = <AlertIcon />;
      hygieneValue = (
        <>
          {score}/5 - below minimum. {checkedStr}
        </>
      );
    } else {
      hygieneIcon = <ClockIcon />;
      hygieneValue = <>Rating pending. {checkedStr}</>;
    }
  }

  // ── insurance row ────────────────────────────────────────────────────────
  const insuranceValid = v.insuranceValidUntil
    ? new Date(v.insuranceValidUntil) > new Date()
    : false;
  const insuranceIcon = v.insuranceValidUntil ? (
    insuranceValid ? (
      <CheckIcon />
    ) : (
      <AlertIcon />
    )
  ) : (
    <ClockIcon />
  );
  const insuranceValue = v.insuranceValidUntil
    ? `${v.insuranceProvider ? `${v.insuranceProvider} - ` : ''}Valid until ${fmtDate(v.insuranceValidUntil)}.`
    : 'Awaiting submission.';

  // ── allergen training row ────────────────────────────────────────────────
  const allergenCurrent =
    v.allergenTrainingHeld &&
    (v.allergenTrainingUntil ? new Date(v.allergenTrainingUntil) > new Date() : true);
  const allergenIcon = allergenCurrent ? (
    <CheckIcon />
  ) : v.allergenTrainingHeld ? (
    <AlertIcon />
  ) : (
    <ClockIcon />
  );
  const allergenValue = allergenCurrent
    ? `Completed${v.allergenTrainingUntil ? `, valid until ${fmtDate(v.allergenTrainingUntil)}` : ''}.`
    : v.allergenTrainingHeld
      ? `Expired${v.allergenTrainingUntil ? ` ${fmtDate(v.allergenTrainingUntil)}` : ''}. Renewal required.`
      : 'Training pending.';

  // ── identity row ─────────────────────────────────────────────────────────
  const idIcon = v.idVerifiedAt ? <CheckIcon /> : <ClockIcon />;
  const idValue = v.idVerifiedAt ? `Verified ${fmtDate(v.idVerifiedAt)}.` : 'Pending.';

  return (
    <section
      aria-label="Feastpot verification"
      className="rounded-2xl border border-cream-deep bg-white p-4"
    >
      {/* Header */}
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-5 w-5">
            <path
              d="M10 2L3 5.5v4.5c0 4.14 3.024 7.98 7 9 3.976-1.02 7-4.86 7-9V5.5L10 2z"
              fill="#00843D"
              opacity=".15"
            />
            <path
              d="M10 2L3 5.5v4.5c0 4.14 3.024 7.98 7 9 3.976-1.02 7-4.86 7-9V5.5L10 2z"
              stroke="#00843D"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M7 10l2 2 4-4"
              stroke="#00843D"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[13px] font-black text-charcoal">Verified by Feastpot</span>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${stateColour}`}>
          {stateLabel}
        </span>
      </div>

      <div className="divide-y divide-cream-deep">
        {/* Food business registration */}
        <Row
          icon={<CheckIcon />}
          label="Food business registration"
          value={`${v.registrationAuthority} - confirmed ${fmtDate(v.registrationConfirmedAt)}.`}
          tooltip="UK law requires every food business to register with their local authority. Feastpot verifies this before approving any vendor."
        />

        {/* Hygiene rating */}
        <Row
          icon={hygieneIcon}
          label="Hygiene rating"
          value={hygieneValue}
          tooltip="The Food Hygiene Rating Scheme (FHRS) rates how well a business meets food hygiene law. Feastpot requires a minimum rating of 3. Ratings are checked against the FSA register weekly."
        />

        {/* Public liability insurance */}
        <Row
          icon={insuranceIcon}
          label="Public liability insurance"
          value={insuranceValue}
          tooltip="All Feastpot vendors carry a minimum of £1 million public liability insurance. This protects customers in the unlikely event of property damage or injury."
        />

        {/* Allergen training */}
        <Row
          icon={allergenIcon}
          label="Allergen training"
          value={allergenValue}
          tooltip="Feastpot requires all vendors to hold recognised allergen awareness training. Vendors must disclose the 14 major allergens on every dish."
        />

        {/* Identity check */}
        <Row
          icon={idIcon}
          label="Identity check"
          value={idValue}
          tooltip="Feastpot verifies photo ID for every vendor owner before approving the listing. This prevents anonymous trading."
        />

        {/* Reviews */}
        {reviewCount != null && (
          <Row
            icon={<CheckIcon />}
            label="Verified reviews"
            value={
              reviewCount === 0
                ? 'No reviews yet.'
                : `${reviewCount.toLocaleString()} review${reviewCount === 1 ? '' : 's'}, all tied to completed orders.`
            }
            tooltip="Every review on Feastpot is linked to a delivered order. We don't allow reviews from unverified purchases."
          />
        )}
      </div>

      <a
        href={`${baseUrl}/trust`}
        className="mt-3 inline-block text-[12px] font-bold text-brand underline underline-offset-2 hover:text-brand-dark"
      >
        How our verification works
      </a>
    </section>
  );
}

import { EnforcementType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const REASON_CODES = [
  'FHRS_BELOW_THRESHOLD',
  'DOCUMENT_EXPIRED',
  'FOOD_SAFETY_CONCERN',
  'MATERIAL_BREACH',
  'REPEATED_COMPLAINTS',
  'STRIPE_FLAG',
  'PROHIBITED_CONDUCT',
  'FRAUD',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/** Reason codes that allow immediate action with urgentBasis. */
export const URGENT_REASON_CODES: readonly ReasonCode[] = [
  'FHRS_BELOW_THRESHOLD',
  'FOOD_SAFETY_CONCERN',
  'STRIPE_FLAG',
  'FRAUD',
] as const;

/**
 * Reason codes that bypass the 30-day termination notice period.
 * Must be recorded explicitly in urgentBasis when used for TERMINATION.
 */
export const SERIOUS_CAUSE_CODES: readonly ReasonCode[] = [
  'FRAUD',
  'FOOD_SAFETY_CONCERN',
  'FHRS_BELOW_THRESHOLD',
] as const;

/** Human-readable descriptions for each reason code (clause 14.1). */
export const REASON_CODE_LABELS: Record<ReasonCode, string> = {
  FHRS_BELOW_THRESHOLD: 'FHRS hygiene rating below threshold',
  DOCUMENT_EXPIRED: 'Compliance document expired',
  FOOD_SAFETY_CONCERN: 'Food safety concern',
  MATERIAL_BREACH: 'Material breach of terms',
  REPEATED_COMPLAINTS: 'Repeated customer complaints',
  STRIPE_FLAG: 'Payment account flagged',
  PROHIBITED_CONDUCT: 'Prohibited conduct',
  FRAUD: 'Fraud or misrepresentation',
};

/** What the vendor should do to resolve each reason code. */
export const REASON_CODE_RESOLVE_STEPS: Record<ReasonCode, string> = {
  FHRS_BELOW_THRESHOLD:
    'Contact your local authority to arrange a re-inspection and achieve a minimum rating of 3/5. Once confirmed, upload evidence and contact support.',
  DOCUMENT_EXPIRED:
    'Upload your renewed compliance documents in the vendor portal under Compliance & Documents.',
  FOOD_SAFETY_CONCERN:
    'Contact Feastpot support immediately to discuss the concern and the steps required to resume trading.',
  MATERIAL_BREACH: 'Review the notice details and contact support to discuss remediation steps.',
  REPEATED_COMPLAINTS:
    'Review the complaint summaries in your disputes history and contact support to discuss remediation.',
  STRIPE_FLAG:
    'Log in to your Stripe dashboard to resolve any outstanding requirements, then contact Feastpot support.',
  PROHIBITED_CONDUCT: 'Contact Feastpot support to discuss this notice.',
  FRAUD: 'Contact Feastpot support immediately. You may also seek independent legal advice.',
};

export class CreateEnforcementActionDto {
  @IsEnum(EnforcementType)
  actionType!: EnforcementType;

  @IsIn(REASON_CODES, {
    message: `reasonCode must be one of: ${REASON_CODES.join(', ')}`,
  })
  reasonCode!: ReasonCode;

  /**
   * Full written statement of reasons.
   * P2B requires at least a substantive narrative; 50 chars is the floor.
   */
  @IsString()
  @MinLength(50, {
    message: 'reasonNarrative must be at least 50 characters (P2B requirement)',
  })
  @MaxLength(10_000)
  reasonNarrative!: string;

  /**
   * When the action takes effect.
   * Non-urgent: must be >= now (notice dispatched immediately).
   * Urgent: may equal now (action is immediate).
   * TERMINATION non-serious: must be >= now + 30 days.
   */
  @IsDateString()
  effectiveAt!: string;

  /**
   * Required for URGENT reason codes (FHRS_BELOW_THRESHOLD, FOOD_SAFETY_CONCERN,
   * STRIPE_FLAG, FRAUD). Must state the public-safety or fraud basis.
   */
  @IsOptional()
  @IsString()
  @MinLength(20)
  urgentBasis?: string;

  /** Additional structured data to store in the facts JSON blob. */
  @IsOptional()
  @IsObject()
  facts?: Record<string, unknown>;
}

export class LiftEnforcementActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  liftNote?: string;
}

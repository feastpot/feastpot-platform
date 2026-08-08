import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TermsDocumentType } from '@prisma/client';

export class PublishTermsVersionDto {
  @IsEnum(TermsDocumentType)
  documentType!: TermsDocumentType;

  /** Semantic version string, e.g. "2.0.0". */
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  version!: string;

  /**
   * Full document text in MDX/Markdown format.
   * contentHash (SHA-256 of this field) is computed by the service on publish.
   * Once published, the content is immutable -- corrections require a new version.
   */
  @IsString()
  @IsNotEmpty()
  contentMdx!: string;

  /**
   * Plain-language summary of what changed in this version.
   * For isMaterial=false this field doubles as the written justification
   * explaining why the change is editorial only.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  changeSummary!: string;

  /**
   * true = material change requiring at least 15 days notice (P2B Regulation).
   * false = editorial change (typo / formatting) -- must justify via changeSummary.
   */
  @IsBoolean()
  isMaterial!: boolean;

  /**
   * ISO-8601 datetime when the terms take effect.
   * For isMaterial=true: must be at least 15 days after the publish request.
   */
  @IsDateString()
  effectiveAt!: string;

  /** Staff member publishing this version (email or name for audit trail). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  createdBy!: string;

  /**
   * Required for VENDOR_TERMS: "Reviewed and approved by [solicitor name] on [date]".
   * The publish endpoint rejects a VENDOR_TERMS version without this field.
   * This is a process control, not legal advice.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  solicitorSignOff?: string;
}

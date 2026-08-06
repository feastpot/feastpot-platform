import { IsDateString, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { TermsDocumentType } from '@prisma/client';

export class PublishTermsVersionDto {
  @IsEnum(TermsDocumentType)
  documentType!: TermsDocumentType;

  /** Semantic version string, e.g. "2.1.0". */
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  version!: string;

  /** SHA-256 of the canonical document content (for change detection). */
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  contentHash!: string;

  /** Plain-language summary of what changed in this version. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  summary!: string;

  /**
   * ISO-8601 datetime when the terms take effect.
   * Must be at least 15 days after the publish request (validated by service).
   */
  @IsDateString()
  effectiveAt!: string;
}

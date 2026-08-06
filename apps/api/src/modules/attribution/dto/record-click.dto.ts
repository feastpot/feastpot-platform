import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RecordClickDto {
  /** The referral link slug from the URL. */
  @IsString()
  @MaxLength(80)
  slug!: string;

  /**
   * Session ID: userId (UUID) for signed-in users, or a client-generated
   * random UUID for anonymous visitors. Stored alongside the click for
   * server-side session-based attribution fallback.
   */
  @IsString()
  @MaxLength(128)
  sessionId!: string;

  /** Hashed (SHA-256 + salt) visitor IP for GDPR-safe analytics. */
  @IsString()
  @MaxLength(64)
  ipHash!: string;

  /** Raw User-Agent string (truncated to 512 chars in service). */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;

  /** Supabase user ID if the visitor is already signed in. */
  @IsOptional()
  @IsUUID()
  userId?: string;
}

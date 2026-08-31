import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateErrorIncidentDto {
  /** Which app raised the error: vendor | web | admin */
  @IsString()
  @MaxLength(20)
  app!: string;

  /** The pathname of the page that errored, e.g. /compliance */
  @IsString()
  @MaxLength(255)
  route!: string;

  /** error.message (sanitised; never includes a stack trace) */
  @IsString()
  @MaxLength(2000)
  message!: string;

  /** Next.js server-side digest, e.g. '4121942664'. Null for client errors. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  digest?: string;

  /**
   * Deprecated diagnostic input retained so older clients are not rejected.
   * Never persisted as authoritative attribution; the API derives identity
   * exclusively from a validated bearer session.
   */
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  /** @deprecated Ignored. Authenticated user attribution is session-derived. */
  @IsOptional()
  @IsUUID()
  userId?: string;
}

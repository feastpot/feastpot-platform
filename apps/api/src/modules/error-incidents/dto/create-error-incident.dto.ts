import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const INCIDENT_APPS = ['vendor', 'web', 'admin'] as const;

export class CreateErrorIncidentDto {
  /** Which app raised the error: vendor | web | admin */
  @IsString()
  @IsIn(INCIDENT_APPS)
  @MaxLength(20)
  app!: string;

  /** The pathname of the page that errored, e.g. /compliance */
  @IsString()
  @MaxLength(255)
  @Matches(/^\/(?!\/)(?:[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)$/, {
    message: 'route must be an absolute application pathname without a query or fragment',
  })
  route!: string;

  /** error.message (sanitised; never includes a stack trace) */
  @IsString()
  @MaxLength(2000)
  message!: string;

  /** Next.js server-side digest, e.g. '4121942664'. Null for client errors. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'digest must be an opaque identifier' })
  digest?: string;

  /**
   * Non-authoritative diagnostic context from older clients. This is never
   * used for attribution; ownership always comes from the validated session.
   */
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  /** Non-authoritative diagnostic context. Authenticated attribution is session-derived. */
  @IsOptional()
  @IsUUID()
  userId?: string;
}

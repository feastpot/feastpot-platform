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

  /** Authenticated vendor's user id, if known at the time of the error */
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  /** Authenticated user id, if known */
  @IsOptional()
  @IsUUID()
  userId?: string;
}

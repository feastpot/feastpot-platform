import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Admin review action on a VendorApplication. Status determines which side
 * effects fire:
 *   - under_review            : audit stamp only (signals "we're looking")
 *   - information_requested   : emails applicant with `adminNotes` as the ask
 *   - approved                : provisions Supabase auth user + DB User +
 *                               Vendor row, sends portal invite (magic link)
 *   - rejected                : emails applicant with `rejectionReason`
 *
 * `adminNotes` is internal-only EXCEPT in the information_requested path,
 * where it's surfaced verbatim to the applicant - so admins should write
 * it as if the applicant will read it when choosing that status.
 *
 * `sendInvite` (default true on approve) lets a reviewer approve without
 * triggering the magic-link email, useful when re-running approval after
 * fixing a downstream failure.
 */
export class UpdateVendorApplicationDto {
  @ApiProperty({
    enum: ['under_review', 'information_requested', 'approved', 'rejected'],
    description:
      'Target status. "pending" is intentionally not allowed - applications cannot be moved back to pending after triage.',
  })
  @IsIn(['under_review', 'information_requested', 'approved', 'rejected'])
  status!: 'under_review' | 'information_requested' | 'approved' | 'rejected';

  @ApiPropertyOptional({
    maxLength: 2000,
    description:
      'Internal admin notes. Surfaced to the applicant ONLY when status="information_requested".',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Required when status="rejected". Surfaced to the applicant in the rejection email.',
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  rejectionReason?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'Approval flow only. When true (default), provision Supabase auth user + Vendor row and send the portal invite email. Set false to mark the application approved without provisioning (e.g. re-running after a partial failure).',
  })
  @IsOptional()
  @IsBoolean()
  sendInvite?: boolean;
}

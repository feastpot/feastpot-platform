import { VendorMemberRole } from '@prisma/client';
import { IsEmail, IsEnum, MaxLength } from 'class-validator';

export class InviteMemberDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // The `owner` role is reserved for the original signup and cannot be
  // assigned through invites. Enforced again in the service for defence
  // in depth.
  @IsEnum(VendorMemberRole)
  role!: VendorMemberRole;
}

export class UpdateMemberRoleDto {
  @IsEnum(VendorMemberRole)
  role!: VendorMemberRole;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, UserRole } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
// IsEnum is still used by OverrideOrderStatusDto / ListAdminOrdersDto below.

// Trim incoming strings so a "   " value fails MinLength rather than
// silently persisting as whitespace.
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Staff-only role set the admin Users page can assign. Customer/vendor
 * roles are intentionally excluded — those are provisioned by other flows
 * (vendor-application approval, customer self-signup) which create the
 * matching Vendor / order-history rows we'd otherwise have to fabricate.
 */
export const STAFF_ROLES = [
  UserRole.admin,
  UserRole.support,
  UserRole.finance,
  UserRole.compliance,
] as const;
export type StaffRoleValue = (typeof STAFF_ROLES)[number];

export class CreateStaffUserDto {
  @ApiProperty({ format: 'email' })
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 60 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ minLength: 1, maxLength: 60 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName!: string;

  @ApiProperty({ enum: STAFF_ROLES, description: 'Staff role to assign on creation' })
  @IsIn(STAFF_ROLES as readonly UserRole[])
  role!: StaffRoleValue;

  @ApiPropertyOptional({
    description:
      'When true (default) we send a Supabase magic-link invite email so the user can set their password and sign in.',
  })
  @IsOptional()
  @IsBoolean()
  sendInvite?: boolean;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: STAFF_ROLES, description: 'New staff role' })
  @IsIn(STAFF_ROLES as readonly UserRole[])
  role!: StaffRoleValue;

  @ApiProperty({
    minLength: 10,
    maxLength: 500,
    description: 'Reason for the role change (audited)',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class IssueCreditDto {
  @ApiProperty({ minimum: 1, description: 'Credit in pence - added 1:1 to the customer loyalty balance' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountPence!: number;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class SuspendUserDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class ReinstateUserDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class OverrideOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ListAdminOrdersDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Order ID (UUID), order number, or customer email substring' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;

  @ApiPropertyOptional({ description: 'today | week | month — convenience preset (use createdFrom/To for custom)' })
  @IsOptional()
  @IsString()
  range?: 'today' | 'week' | 'month';

  @ApiPropertyOptional({ description: 'ISO date - include only orders created on/after this date' })
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'ISO date - include only orders created on/before this date (end of day UTC)' })
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({
    description: 'Filter by latest payment status (any payment row on the order matches)',
    enum: ['pending', 'succeeded', 'failed', 'cancelled'],
  })
  @IsOptional()
  @IsIn(['pending', 'succeeded', 'failed', 'cancelled'])
  paymentStatus?: 'pending' | 'succeeded' | 'failed' | 'cancelled';

  @ApiPropertyOptional({
    description: 'Enrich rows with Stripe PaymentIntent status (capped to first 50)',
  })
  @IsOptional()
  withPiStatus?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Page number (1-based, default 1)', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

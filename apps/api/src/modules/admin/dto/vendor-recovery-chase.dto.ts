import { ApiProperty } from '@nestjs/swagger';
import { NotificationChannel, VendorOnboardingStepName } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class VendorRecoveryChaseDto {
  @ApiProperty({ enum: VendorOnboardingStepName })
  @IsEnum(VendorOnboardingStepName)
  item!: VendorOnboardingStepName;

  @ApiProperty({ enum: [NotificationChannel.email, NotificationChannel.sms] })
  @IsIn([NotificationChannel.email, NotificationChannel.sms])
  channel!: NotificationChannel;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class BulkVendorRecoveryChaseDto {
  @ApiProperty({ type: [Object], maxItems: 100 })
  requests!: Array<{ vendorId: string; dto: VendorRecoveryChaseDto }>;
}

import { ApiProperty } from '@nestjs/swagger';
import { VendorOnboardingStepName, VendorRequiredItemState } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateRequiredOnboardingItemDto {
  @ApiProperty({ enum: VendorOnboardingStepName })
  @IsEnum(VendorOnboardingStepName)
  name!: VendorOnboardingStepName;
  /** supplied is server-derived from canonical onboarding/compliance evidence. */
  @ApiProperty({ enum: [VendorRequiredItemState.deferred, VendorRequiredItemState.outstanding] })
  @IsEnum(VendorRequiredItemState)
  state!: VendorRequiredItemState;
}

import { IsEnum, IsString } from 'class-validator';

export enum FeastPassPlanDto {
  MONTHLY = 'MONTHLY',
  ANNUAL = 'ANNUAL',
}

export class CreateCheckoutSessionDto {
  @IsEnum(FeastPassPlanDto)
  plan!: FeastPassPlanDto;

  @IsString()
  successUrl!: string;

  @IsString()
  cancelUrl!: string;
}

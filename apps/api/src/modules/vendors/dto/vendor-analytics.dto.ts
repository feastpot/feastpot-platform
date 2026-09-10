import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { TaxEntityType } from '@prisma/client';

export class WeeklyRevenueBucketDto {
  @ApiProperty({ description: 'ISO date for the Monday that starts this week (UTC)' })
  weekStart!: string;

  @ApiProperty()
  ordersCount!: number;

  @ApiProperty({ description: 'Net revenue in pence (excludes cancelled/refunded)' })
  revenuePence!: number;
}

export class TopDishDto {
  @ApiProperty()
  menuItemId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  ordersCount!: number;

  @ApiProperty()
  unitsSold!: number;

  @ApiProperty()
  revenuePence!: number;
}

export class HourlyOrdersBucketDto {
  @ApiProperty({ minimum: 0, maximum: 23 })
  hour!: number;

  @ApiProperty()
  ordersCount!: number;
}

export class VendorAnalyticsResponseDto {
  @ApiProperty({ type: [WeeklyRevenueBucketDto], description: 'Last 8 ISO weeks oldest→newest' })
  weeklyRevenue!: WeeklyRevenueBucketDto[];

  @ApiProperty({ type: [TopDishDto], description: 'Top 10 dishes by revenue (last 90 days)' })
  topDishes!: TopDishDto[];

  @ApiProperty({ type: [HourlyOrdersBucketDto], description: '24 buckets, hour 0..23 UTC' })
  hourlyDistribution!: HourlyOrdersBucketDto[];

  @ApiProperty()
  averageOrderValuePence!: number;

  @ApiProperty({ description: 'Reorder rate from the vendor profile (percent)' })
  reorderRatePct!: number;
}

export class StripeConnectSessionDto {
  @ApiPropertyOptional({ enum: [TaxEntityType.SOLE_TRADER, TaxEntityType.LIMITED_COMPANY] })
  @IsOptional()
  @IsIn([TaxEntityType.SOLE_TRADER, TaxEntityType.LIMITED_COMPANY])
  entityType?: TaxEntityType;
}

export class StripeConnectSessionResponseDto {
  @ApiProperty({ description: 'Connected account id (acct_…) - useful for debugging' })
  accountId!: string;

  @ApiProperty()
  clientSecret!: string;

  @ApiProperty({ enum: [TaxEntityType.SOLE_TRADER, TaxEntityType.LIMITED_COMPANY] })
  businessType!: TaxEntityType;

  @ApiProperty()
  payoutsEnabled!: boolean;
}

import { ApiProperty } from '@nestjs/swagger';

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

export class StripeConnectLinkResponseDto {
  @ApiProperty({ description: 'Hosted Stripe URL the vendor should be redirected to' })
  url!: string;

  @ApiProperty({ description: 'Connected account id (acct_…) — useful for debugging' })
  accountId!: string;
}

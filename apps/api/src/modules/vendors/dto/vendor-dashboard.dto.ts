import { ApiProperty } from '@nestjs/swagger';

export class DashboardOrderDueDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() status!: string;
  @ApiProperty() deliveryType!: string;
  @ApiProperty({ nullable: true }) scheduledFor!: string | null;
  @ApiProperty() itemCount!: number;
  @ApiProperty() totalPence!: number;
}

export class DashboardUpcomingOrderDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true }) scheduledFor!: string | null;
  @ApiProperty() totalPence!: number;
}

export class DashboardEventEnquiriesDto {
  @ApiProperty({ description: 'Open enquiries awaiting this vendor’s quote' })
  pending!: number;

  @ApiProperty({
    nullable: true,
    description: 'ISO date of the soonest event we still need to quote, if any',
  })
  nextEventDate!: string | null;
}

export class DashboardNextPayoutDto {
  @ApiProperty({ nullable: true })
  expectedDate!: string | null;

  @ApiProperty()
  amountPence!: number;

  @ApiProperty({
    enum: ['accruing', 'pending_approval', 'approved', 'transferring'],
    description: 'High-level state for the next payout we can show the vendor',
  })
  state!: 'accruing' | 'pending_approval' | 'approved' | 'transferring';

  @ApiProperty() orderCount!: number;
}

export class DashboardMenuWarningItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ isArray: true, enum: ['no_image', 'no_allergens'] })
  issues!: Array<'no_image' | 'no_allergens'>;
}

export class DashboardMenuHealthDto {
  @ApiProperty() missingImages!: number;
  @ApiProperty() missingAllergens!: number;
  @ApiProperty({ type: [DashboardMenuWarningItemDto] })
  items!: DashboardMenuWarningItemDto[];
}

export class VendorDashboardResponseDto {
  @ApiProperty({ type: [DashboardOrderDueDto] })
  ordersDueToday!: DashboardOrderDueDto[];

  @ApiProperty({ type: [DashboardUpcomingOrderDto] })
  upcomingOrders!: DashboardUpcomingOrderDto[];

  @ApiProperty({ type: DashboardEventEnquiriesDto })
  eventEnquiries!: DashboardEventEnquiriesDto;

  @ApiProperty({ type: DashboardNextPayoutDto, nullable: true })
  nextPayout!: DashboardNextPayoutDto | null;

  @ApiProperty({ type: DashboardMenuHealthDto })
  menuHealth!: DashboardMenuHealthDto;
}

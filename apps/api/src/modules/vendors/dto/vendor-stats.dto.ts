import { ApiProperty } from '@nestjs/swagger';

class VendorStatsBucket {
  @ApiProperty({ description: 'Number of orders in this period' })
  orders!: number;

  @ApiProperty({ description: 'Gross order value in pence (totalPence)' })
  revenuePence!: number;
}

export class VendorStatsResponseDto {
  @ApiProperty({ type: VendorStatsBucket })
  today!: VendorStatsBucket;

  @ApiProperty({ type: VendorStatsBucket })
  week!: VendorStatsBucket;

  @ApiProperty({ description: 'Pending orders awaiting vendor action right now' })
  pendingNow!: number;
}

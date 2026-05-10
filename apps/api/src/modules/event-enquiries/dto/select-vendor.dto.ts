import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SelectVendorDto {
  @ApiProperty()
  @IsUUID()
  vendorId!: string;
}

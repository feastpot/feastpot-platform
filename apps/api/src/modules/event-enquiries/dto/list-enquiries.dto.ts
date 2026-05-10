import { ApiPropertyOptional } from '@nestjs/swagger';
import { EnquiryStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListEventEnquiriesDto {
  @ApiPropertyOptional({ enum: EnquiryStatus })
  @IsOptional()
  @IsEnum(EnquiryStatus)
  status?: EnquiryStatus;
}

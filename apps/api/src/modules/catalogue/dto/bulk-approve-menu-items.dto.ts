import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class BulkApproveMenuItemDto {
  @IsUUID('4')
  id!: string;

  @IsInt()
  @IsPositive()
  expectedSubmissionVersion!: number;
}

export class BulkApproveMenuItemsDto {
  @ApiProperty({
    type: [BulkApproveMenuItemDto],
    description: 'Held item revisions belonging to the route vendor.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((item: BulkApproveMenuItemDto) => item.id)
  @ValidateNested({ each: true })
  @Type(() => BulkApproveMenuItemDto)
  items!: BulkApproveMenuItemDto[];
}

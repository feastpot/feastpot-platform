import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ReorderMenuItemsDto {
  @ApiProperty({
    type: [String],
    description:
      'Ordered array of menu-item IDs — first element becomes sortOrder 1. Must contain exactly the menu\'s current item IDs.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  itemIds!: string[];
}

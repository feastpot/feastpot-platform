import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ReorderMenusDto {
  @ApiProperty({
    type: [String],
    description:
      'Ordered array of menu IDs — first element becomes sortOrder 1. Must contain exactly the vendor\'s current menu IDs.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  menuIds!: string[];
}

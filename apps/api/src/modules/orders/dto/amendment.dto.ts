import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class AmendmentItemDto {
  @ApiProperty()
  @IsUUID()
  orderItemId!: string;

  @ApiProperty({ description: 'Replacement menu item id' })
  @IsUUID()
  substituteMenuItemId!: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class CreateAmendmentDto {
  @ApiProperty({ type: [AmendmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AmendmentItemDto)
  substitutions!: AmendmentItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class RespondAmendmentDto {
  @ApiProperty()
  @IsBoolean()
  accept!: boolean;
}

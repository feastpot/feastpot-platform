import { ApiProperty } from '@nestjs/swagger';
import { IssueType } from '@prisma/client';
import { IsEnum, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateDisputeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ enum: IssueType })
  @IsEnum(IssueType)
  issueType!: IssueType;

  @ApiProperty({ minLength: 10, maxLength: 4000 })
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description!: string;
}

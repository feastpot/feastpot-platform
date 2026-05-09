import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyDocumentDto {
  @ApiProperty({ enum: [DocumentStatus.verified, DocumentStatus.rejected] })
  @IsEnum(DocumentStatus)
  status!: DocumentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectReason?: string;
}

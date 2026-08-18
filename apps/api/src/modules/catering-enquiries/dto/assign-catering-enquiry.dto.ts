import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AssignCateringEnquiryDto {
  @IsUUID()
  vendorId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

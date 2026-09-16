import { IsString } from 'class-validator';

export class CreateTestVendorPersonasDto {
  @IsString()
  confirmation!: string;
}

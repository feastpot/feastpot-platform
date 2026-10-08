import { Equals, IsString, IsUUID, Length } from 'class-validator';

export class RequestAccountDeletionDto {
  @Equals('DELETE')
  confirmation!: string;
}

export class AdminRequestAccountDeletionDto extends RequestAccountDeletionDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @Length(10, 500)
  reason!: string;
}

export class CancelAccountDeletionDto {
  @IsString()
  @Length(10, 500)
  reason!: string;
}

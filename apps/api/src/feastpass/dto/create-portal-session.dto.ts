import { IsString } from 'class-validator';

export class CreatePortalSessionDto {
  @IsString()
  returnUrl!: string;
}

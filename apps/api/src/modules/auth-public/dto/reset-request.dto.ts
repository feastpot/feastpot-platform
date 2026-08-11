import { IsEmail, IsIn, IsString } from 'class-validator';

export class ResetRequestDto {
  @IsEmail()
  email!: string;

  /**
   * Which app the request originates from - controls the `redirectTo` URL
   * embedded in the reset email so the vendor portal can use its own
   * /auth/callback and the customer app uses its own.
   */
  @IsString()
  @IsIn(['customer', 'vendor'])
  app!: 'customer' | 'vendor';
}

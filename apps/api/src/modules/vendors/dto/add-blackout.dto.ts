import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body shape for POST /vendors/me/blackouts. The date is taken as an
 * ISO calendar day; the service normalises it to UTC midnight to match
 * the BlackoutDate.date column (which is DATE, not TIMESTAMP).
 */
export class AddBlackoutDto {
  @ApiProperty({
    description: 'Calendar date to black out, ISO-8601 (YYYY-MM-DD or full timestamp).',
    example: '2026-12-25',
  })
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional({
    description: 'Short reason shown to customers and on the vendor calendar.',
    example: 'Closed for Eid',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

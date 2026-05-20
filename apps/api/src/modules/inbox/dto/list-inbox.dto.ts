import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * T007: query DTO for GET /v1/inbox.
 *
 * Pagination uses an opaque `cursor` (base64 of {createdAt,id}) so we can
 * order strictly by createdAt DESC without offset-based drift when new
 * rows arrive between page loads.
 */
export class ListInboxDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  /** `true` returns only unread rows. */
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBooleanString()
  unreadOnly?: string;
}

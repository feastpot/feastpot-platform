import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Event names accepted from client apps (apps/web + apps/vendor).
 *
 * order_attribution_source is intentionally ABSENT: it is fired server-side
 * by OrdersService and must never be submitted by a client.
 */
export const CLIENT_EVENT_NAMES = [
  'vendor_page_view',
  'calculator_interaction',
  'application_start',
  'application_complete',
  'share_link_click',
  'qr_scan',
] as const;

export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number];

export class TrackEventDto {
  @ApiProperty({ enum: CLIENT_EVENT_NAMES, description: 'Analytics event name' })
  @IsString()
  @IsIn(CLIENT_EVENT_NAMES)
  eventName!: ClientEventName;

  /**
   * Non-PII key/value pairs describing the event.
   * Validated as a plain object but contents are not further schema-checked
   * here - each event's properties are documented in the client hook that
   * fires it. PII must never appear here (enforced by code review, not
   * runtime validation, because PII categories are unbounded).
   */
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;

  /**
   * Random UUID stored in the browser's localStorage under `fp_anon`.
   * Correlates events within an anonymous session. Never a cookie so it does
   * not require cookie-consent banners. Absent when localStorage is blocked.
   */
  @ApiPropertyOptional({ example: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  anonVisitorId?: string;

  /**
   * Vendor UUID: present for authenticated vendor-portal events
   * (share_link_click). Client supplies this from its own session context;
   * it is not validated against the auth token here because analytics events
   * are low-stakes and never grant access to protected resources.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  vendorId?: string;
}

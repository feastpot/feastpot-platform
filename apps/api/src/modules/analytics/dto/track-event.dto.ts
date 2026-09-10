import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Event names accepted from client apps (apps/web + apps/vendor).
 *
 * order_attribution_source is intentionally ABSENT: it is fired server-side
 * by OrdersService and must never be submitted by a client.
 */
export const CLIENT_EVENT_NAMES = [
  'become_a_vendor_landed',
  'calculator_interaction',
  'application_phase_1_started',
  'application_phase_1_completed',
  'application_phase_2_started',
  'application_menu_uploaded',
  'application_phase_2_submitted',
  'application_field_abandoned',
  'vendor_required_item_deferred',
  'vendor_required_item_resumed',
] as const;

export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number];

export class TrackEventDto {
  @ApiProperty({ enum: CLIENT_EVENT_NAMES, description: 'Analytics event name' })
  @IsString()
  @IsIn(CLIENT_EVENT_NAMES)
  eventName!: ClientEventName;

  /**
   * The service applies an event-specific allowlist. Do not widen this DTO
   * into an arbitrary JSON bag: values in analytics are retained.
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

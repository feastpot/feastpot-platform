import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body sent by the vendor portal when a vendor click-wraps a terms version.
 *
 * Legal basis: Electronic Communications Act 2000, retained eIDAS Regulation,
 * and the Law Commission's 2019 statement on electronic execution. Click-wrap
 * is enforceable where the vendor had reasonable notice of the terms and took
 * a clear affirmative action. All nine audit fields are required.
 *
 * DO NOT:
 * - Allow acceptance on behalf of a vendor by an admin.
 * - Pre-populate scrolledToEnd or set it to true artificially.
 * - Bundle terms acceptance with any marketing consent.
 */
export class AcceptTermsVersionDto {
  /**
   * Exact label text shown to the vendor next to the checkbox.
   * Recorded verbatim so the acceptance record is self-contained.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  acceptanceText!: string;

  /**
   * Whether the vendor scrolled to the bottom of the terms pane before
   * ticking the checkbox. Must not be hardcoded to true by the client.
   */
  @IsBoolean()
  scrolledToEnd!: boolean;
}

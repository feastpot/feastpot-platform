/**
 * UK postcode utilities shared across public intake endpoints.
 *
 * The loose format regex covers the full postcode standard (Annex C of the
 * Royal Mail PAF specification) and is intentionally permissive — validation
 * rejects malformed strings but accepts edge-case valid postcodes such as
 * single-letter outward codes (E1), BFPO codes, and GIR 0AA.
 *
 * Normalisation collapses whitespace, upper-cases, then re-inserts the
 * single canonical space before the final three inward characters.
 */

/** Loose UK postcode pattern. Match is case-insensitive after upper-casing. */
const UK_POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$|^GIR\s*0AA$/i;

/**
 * Returns true when `raw` looks like a valid UK postcode.
 * Strips internal spaces before testing so "SE15 4EE" and "SE154EE" both pass.
 */
export function isValidUkPostcode(raw: string): boolean {
  return UK_POSTCODE_REGEX.test(raw.replace(/\s+/g, '').trim());
}

/**
 * Normalise a raw postcode string to canonical form: uppercase, single
 * space before the final three inward characters.
 * "se15 4ee", "SE154EE", "SE15  4EE" → "SE15 4EE".
 */
export function normalisePostcode(raw: string): string {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  if (compact.length <= 3) return compact;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

/**
 * Extract the outward code (first half of a normalised postcode).
 * "SE15 4EE" → "SE15", "SW1A 1AA" → "SW1A", "E1 6RF" → "E1".
 */
export function extractOutwardCode(normalisedPostcode: string): string {
  const spaceIdx = normalisedPostcode.indexOf(' ');
  return spaceIdx >= 0 ? normalisedPostcode.slice(0, spaceIdx) : normalisedPostcode;
}

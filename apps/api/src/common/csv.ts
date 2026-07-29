/**
 * Shared CSV helpers for admin export endpoints.
 *
 * All admin CSV exports follow the same pattern: honour the list-view
 * filters, page through with keyset pagination, hard-cap the row count so a
 * runaway export can't hold a DB connection open indefinitely, and stream
 * chunks straight to the HTTP response.
 */

/**
 * RFC-4180 quoting plus CSV-injection guard: spreadsheet apps execute cells
 * starting with =, +, -, or @ as formulas, so those are prefixed with a
 * single quote and shown verbatim.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(fields: Array<string | number | boolean | null | undefined>): string {
  return fields.map((f) => csvCell(f)).join(',') + '\n';
}

/** Row cap shared by every admin export (matches the coverage-waitlist cap). */
export const CSV_EXPORT_HARD_CAP = 5000;
export const CSV_EXPORT_PAGE = 500;

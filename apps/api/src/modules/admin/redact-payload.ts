/**
 * Redacts sensitive fields from a Bull job payload before exposing it in the
 * admin dead-letter list. Dead-letter jobs can originate from any queue and
 * may carry customer PII (email, name, address) or payment identifiers that
 * should not be displayed in full in a shared admin UI.
 *
 * Redaction rules:
 *  - Keys whose lowercased name contains any SENSITIVE_FRAGMENTS token have
 *    their value replaced with `[REDACTED]`.
 *  - Nested objects are recursed up to MAX_DEPTH.
 *  - Arrays are mapped element-by-element.
 *  - Primitive values at non-sensitive keys are preserved as-is.
 *
 * UUIDs and Stripe IDs (payoutId, stripeTransferId, etc.) are preserved so
 * admins can cross-reference the job with the relevant DB/Stripe record.
 *
 * Non-exhaustive sensitive key fragments (case-insensitive):
 *   email, phone, name, address, street, postcode, city, subject, html,
 *   body (used for raw email HTML), recipient, to (email recipient field).
 *
 * Not redacted: amountPence, currency, payoutId, vendorId, orderId,
 *   stripeAccountId, jobId -- identifiers needed for retrying the job.
 */

const SENSITIVE_FRAGMENTS = [
  'email',
  'phone',
  'name',
  'address',
  'street',
  'postcode',
  'city',
  'subject',
  'html',
  'body',
  'recipient',
  'to',
  'from',
  'message',
  'content',
  'text',
  'token',
  'secret',
  'password',
  'credential',
];

const MAX_DEPTH = 6;

export function redactPayload(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    // Limit array length in the output to keep responses manageable.
    return value.slice(0, 20).map((item) => redactPayload(item, depth + 1));
  }

  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(record)) {
    const lower = key.toLowerCase();
    const isSensitive = SENSITIVE_FRAGMENTS.some((frag) => lower.includes(frag));
    result[key] = isSensitive ? '[REDACTED]' : redactPayload(val, depth + 1);
  }

  return result;
}

/**
 * Browser-supplied headers used by the customer and vendor acquisition flows.
 * Keep the origin allowlist separate: allowing a header does not authorise an
 * untrusted origin or grant permission to access an application draft.
 */
export const API_CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'x-request-id',
  'X-Fp-Anon-Id',
  'X-Fp-Ref',
  'X-Fp-Sid',
  'X-Fp-Mktplace',
];

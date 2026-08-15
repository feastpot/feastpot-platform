/**
 * Error incident reporting :  called by vendor portal error boundaries to
 * persist an exception and receive a real, searchable FP-XXXX-XXXX reference.
 *
 * This helper deliberately uses raw fetch (not the authenticated client.ts)
 * because errors can occur before the vendor is logged in.
 */

const API_BASE =
  (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : undefined) ??
  'https://api.feastpot.co.uk';

interface CreateIncidentPayload {
  app: string;
  route: string;
  message: string;
  digest?: string;
  vendorId?: string;
  userId?: string;
}

interface IncidentResponse {
  ref: string;
}

/**
 * Reports an error to the API and returns the FP-XXXX-XXXX reference.
 * Resolves to null if the request fails :  error logging must never cause a
 * secondary error.
 */
export async function reportErrorIncident(payload: CreateIncidentPayload): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/error-incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as IncidentResponse;
    return data.ref ?? null;
  } catch {
    return null;
  }
}

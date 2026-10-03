import { API_URL } from '@/lib/env';
import { createClient } from '@/lib/supabase/client';

interface CreateIncidentPayload {
  app: 'web';
  route: string;
  message: string;
  detail?: string;
  digest?: string;
}

interface IncidentResponse {
  ref: string;
}

export async function reportErrorIncident(payload: CreateIncidentPayload): Promise<string | null> {
  try {
    let accessToken: string | undefined;
    if (typeof window !== 'undefined') {
      try {
        accessToken = (await createClient().auth.getSession()).data.session?.access_token;
      } catch {
        /* Anonymous reporting must still work when auth fails. */
      }
    }
    const response = await fetch(`${API_URL}/v1/error-incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as IncidentResponse;
    return typeof data.ref === 'string' && /^FP-[A-F0-9]{4}-[A-F0-9]{4}$/.test(data.ref)
      ? data.ref
      : null;
  } catch {
    return null;
  }
}

import { API_URL } from '@/lib/env';
import { createClient } from '@/lib/supabase/client';

interface CreateIncidentPayload {
  app: 'web';
  route: string;
  message: string;
  digest?: string;
}

interface IncidentResponse {
  ref: string;
}

export async function reportErrorIncident(payload: CreateIncidentPayload): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await createClient().auth.getSession();
    const response = await fetch(`${API_URL}/v1/error-incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as IncidentResponse;
    return data.ref ?? null;
  } catch {
    return null;
  }
}

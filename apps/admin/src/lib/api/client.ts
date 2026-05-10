import { API_URL } from '../env';

/**
 * Thin fetch wrapper that surfaces structured error envelopes from the API
 * (`{ code, message, details? }`). All admin pages funnel through here so
 * we always carry the bearer token and consistently raise `ApiError`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  accessToken?: string | null;
  body?: unknown;
  /** Server-component cache hint passthrough. */
  next?: { revalidate?: number; tags?: string[] };
}

export async function apiRequest<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_URL}/v1${path}`;
  const headers = new Headers(init.headers as HeadersInit | undefined);
  if (init.accessToken) headers.set('Authorization', `Bearer ${init.accessToken}`);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, {
    ...init,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const payload = (await res.json().catch(() => null)) as
        | { code?: string; message?: string; details?: unknown }
        | null;
      throw new ApiError(
        res.status,
        payload?.code ?? `HTTP_${res.status}`,
        payload?.message ?? res.statusText,
        payload?.details,
      );
    }
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `HTTP_${res.status}`, text || res.statusText);
  }

  if (!contentType.includes('application/json')) {
    return (await res.text()) as unknown as T;
  }
  return (await res.json()) as T;
}

/**
 * Build a fully-qualified URL to the API for direct browser navigation
 * (e.g. CSV download). Caller is responsible for adding the bearer token
 * via a fetched Blob+download anchor flow if the route requires auth.
 */
export function apiUrl(path: string): string {
  return path.startsWith('http') ? path : `${API_URL}/v1${path}`;
}

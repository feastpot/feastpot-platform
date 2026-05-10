import { API_URL } from '@/lib/env';

/**
 * Lightweight typed fetch wrapper for the Feastpot API. Mirrors apps/web/src/lib/api/client.ts.
 *
 * - All routes are versioned under `/v1` (NestJS URI versioning).
 * - 4xx/5xx responses become a thrown `ApiError` carrying the parsed body.
 * - `accessToken` is required for vendor routes.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  body?: unknown;
  constructor(status: number, message: string, body?: unknown, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

export type QueryValue = string | number | boolean | string[] | undefined | null;
export type QueryParams = { [key: string]: QueryValue };

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: QueryParams;
  body?: unknown;
  accessToken?: string;
  next?: { revalidate?: number; tags?: string[] };
  signal?: AbortSignal;
}

function buildQuery(query: QueryParams | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length > 0) params.set(k, v.join(','));
    } else {
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function apiRequest<T>(path: string, opts: ApiRequestOptions = {}): Promise<T> {
  const url = `${API_URL}/v1${path}${buildQuery(opts.query)}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    next: opts.next,
  });

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  const body: unknown = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text();

  if (!res.ok) {
    const parsed = (body && typeof body === 'object' ? body : {}) as {
      code?: string;
      message?: string;
    };
    throw new ApiError(res.status, parsed.message ?? `Request failed: ${res.status}`, body, parsed.code);
  }
  return body as T;
}

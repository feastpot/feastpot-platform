import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * Lightweight status endpoint for the tracking page's polling fallback.
 *
 * Why this exists alongside `useOrder` (which already polls every 30s via
 * TanStack Query against the NestJS API): this hits Postgres directly through
 * Supabase RLS and returns a tiny `{ status, updatedAt }` payload - useful for
 * environments where WebSockets are blocked AND we want to minimise mobile
 * data (compared to the full Order DTO from the API). RLS on `orders` ensures
 * a customer can only read their own row.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('orders')
    .select('status, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'FETCH_FAILED', message: error.message }, { status: 502 });
  }
  if (!data) {
    // RLS may legitimately hide a row that exists - same response as a
    // genuine 404 to avoid leaking existence.
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  return NextResponse.json({
    status: data.status,
    updatedAt: data.updated_at,
  });
}

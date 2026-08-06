import { createHash, randomUUID } from 'crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { type NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.feastpot.co.uk';
/** 30 days in seconds. */
const FP_REF_MAX_AGE = 30 * 24 * 60 * 60;

interface ClickResult {
  ok: boolean;
  vendorSlug: string | null;
  referralLinkId: string | null;
  clickId: string | null;
}

/**
 * /v/[slug] - referral link redirect handler.
 *
 * 1. Reads or generates a session ID (fp_sid cookie, 30-day).
 * 2. Hashes the visitor's IP for privacy (SHA-256 + static salt).
 * 3. Calls POST /v1/attribution/clicks to record the click server-side
 *    (this is the durable server-side persistence that survives cookie loss).
 * 4. Sets fp_ref cookie (not HttpOnly so JS can pass it in the order request).
 * 5. Redirects to /vendors/[vendorSlug] or /vendors on unknown slug.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const headerStore = await headers();

  // ── Session ID ──────────────────────────────────────────────────────────────
  const existingSession = cookieStore.get('fp_sid')?.value;
  const sessionId = existingSession ?? randomUUID();

  // ── IP hash ─────────────────────────────────────────────────────────────────
  const forwarded = headerStore.get('x-forwarded-for');
  const rawIp = forwarded?.split(',')[0]?.trim() ?? '0.0.0.0';
  const salt = process.env.IP_HASH_SALT ?? 'feastpot-referral-v1';
  const ipHash = createHash('sha256').update(`${salt}:${rawIp}`).digest('hex');

  const userAgent = headerStore.get('user-agent') ?? undefined;

  // ── Record click server-side ─────────────────────────────────────────────────
  let clickResult: ClickResult = { ok: false, vendorSlug: null, referralLinkId: null, clickId: null };
  try {
    const res = await fetch(`${API_URL}/v1/attribution/clicks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, sessionId, ipHash, userAgent }),
      next: { revalidate: 0 },
    });
    if (res.ok) {
      clickResult = (await res.json()) as ClickResult;
    }
  } catch {
    // Network error - still redirect; attribution just won't be recorded.
  }

  // ── Set cookies ─────────────────────────────────────────────────────────────
  const response = NextResponse.redirect(
    clickResult.vendorSlug
      ? new URL(`/vendors/${clickResult.vendorSlug}`, process.env.NEXT_PUBLIC_SITE_URL ?? 'https://feastpot.co.uk')
      : new URL('/vendors', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://feastpot.co.uk'),
  );

  const cookieOpts = {
    path: '/',
    maxAge: FP_REF_MAX_AGE,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };

  // fp_sid: session identifier (not HttpOnly - JS may read for consistency)
  response.cookies.set('fp_sid', sessionId, cookieOpts);

  // fp_ref: attribution reference (not HttpOnly so the web app can read and
  // pass it as X-Fp-Ref in the order creation request)
  if (clickResult.referralLinkId && clickResult.clickId) {
    const fpRef = `${clickResult.referralLinkId}|${clickResult.clickId}|${Date.now()}`;
    response.cookies.set('fp_ref', fpRef, cookieOpts);
  }

  return response;
}

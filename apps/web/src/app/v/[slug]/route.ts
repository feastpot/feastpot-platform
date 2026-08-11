import { createHash, randomUUID } from 'crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { type NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.feastpot.co.uk';

/** 30-day VENDOR marker window (seconds). */
const FP_REF_MAX_AGE = 30 * 24 * 60 * 60;

/** 90-day MARKETPLACE marker window (seconds). */
const FP_MKTPLACE_MAX_AGE = 90 * 24 * 60 * 60;

/**
 * Regex to detect bot / crawler user-agents. Matches headless prefetch agents,
 * social-preview scrapers, and known crawlers. Applied before recording any
 * clicks or setting any attribution cookies so bots never pollute the funnel.
 */
const BOT_UA_RE =
  /bot|crawl|spider|slurp|preview|prerender|prefetch|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegram|googlebot|bingbot|yandexbot|baiduspider|archive\.org_bot|Screaming Frog|SiteAudit/i;

interface ClickResult {
  ok: boolean;
  vendorSlug: string | null;
  referralLinkId: string | null;
  clickId: string | null;
  vendorId: string | null;
}

/**
 * /v/[slug] - referral link redirect handler.
 *
 * 1. Rejects bots and prefetch agents early (redirect only; no click record).
 * 2. Reads or generates a session ID (fp_sid cookie, 30-day).
 * 3. Hashes the visitor's IP for privacy (SHA-256 + static salt).
 * 4. Calls POST /v1/attribution/clicks to record the click server-side
 *    (this is the durable server-side persistence that survives cookie loss).
 * 5. Override rule: if a valid MARKETPLACE marker (fp_mp_{vendorId}, 90-day)
 *    already exists for this vendor, the fp_ref cookie is NOT set - platform
 *    attribution wins over a later vendor referral click.
 * 6. Sets fp_ref cookie only when the marketplace marker is absent or expired.
 * 7. Redirects to /vendors/[vendorSlug] or /vendors on unknown slug.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  // Detect QR scans: the QR URL is generated with &m=qr so scans are
  // distinguishable from plain link clicks in analytics.
  const isQrScan = req.nextUrl.searchParams.get('m') === 'qr';
  const cookieStore = await cookies();
  const headerStore = await headers();

  // ── Bot / prefetch guard ─────────────────────────────────────────────────────
  const userAgent = headerStore.get('user-agent') ?? '';
  if (BOT_UA_RE.test(userAgent)) {
    // Redirect without recording a click or touching cookies.
    return NextResponse.redirect(
      new URL('/vendors', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://feastpot.co.uk'),
    );
  }

  // ── Session ID ──────────────────────────────────────────────────────────────
  const existingSession = cookieStore.get('fp_sid')?.value;
  const sessionId = existingSession ?? randomUUID();

  // ── IP hash ─────────────────────────────────────────────────────────────────
  const forwarded = headerStore.get('x-forwarded-for');
  const rawIp = forwarded?.split(',')[0]?.trim() ?? '0.0.0.0';
  const salt = process.env.IP_HASH_SALT ?? 'feastpot-referral-v1';
  const ipHash = createHash('sha256').update(`${salt}:${rawIp}`).digest('hex');

  // ── Record click server-side ─────────────────────────────────────────────────
  let clickResult: ClickResult = { ok: false, vendorSlug: null, referralLinkId: null, clickId: null, vendorId: null };
  try {
    const res = await fetch(`${API_URL}/v1/attribution/clicks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, sessionId, ipHash, userAgent: userAgent || undefined }),
      next: { revalidate: 0 },
    });
    if (res.ok) {
      clickResult = (await res.json()) as ClickResult;
    }
  } catch {
    // Network error - still redirect; attribution just won't be recorded.
  }

  // ── qr_scan analytics event ──────────────────────────────────────────────────
  // Fire after recording the click so vendorId is available from clickResult.
  // Uses the public analytics endpoint (no auth needed). Fire-and-forget;
  // never blocks the redirect even if the analytics endpoint is unreachable.
  if (isQrScan && clickResult.vendorId) {
    void fetch(`${API_URL}/v1/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: 'qr_scan',
        properties: { slug },
        vendorId: clickResult.vendorId,
      }),
      next: { revalidate: 0 },
    }).catch(() => null);
  }

  // ── Override rule ────────────────────────────────────────────────────────────
  // If a valid MARKETPLACE marker exists for this vendor (within the 90-day window),
  // do NOT set fp_ref - the customer is marketplace-attributed and the vendor's
  // QR code / referral link must not overwrite that.
  const MARKETPLACE_WINDOW_MS = FP_MKTPLACE_MAX_AGE * 1000;
  let suppressVendorCookie = false;
  if (clickResult.vendorId) {
    const mktplaceMarker = cookieStore.get(`fp_mp_${clickResult.vendorId}`)?.value;
    if (mktplaceMarker) {
      const ts = parseInt(mktplaceMarker, 10);
      if (!Number.isNaN(ts) && Date.now() - ts <= MARKETPLACE_WINDOW_MS) {
        suppressVendorCookie = true;
      }
    }
  }

  // ── Build redirect response ──────────────────────────────────────────────────
  const response = NextResponse.redirect(
    clickResult.vendorSlug
      ? new URL(`/vendors/${clickResult.vendorSlug}`, process.env.NEXT_PUBLIC_SITE_URL ?? 'https://feastpot.co.uk')
      : new URL('/vendors', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://feastpot.co.uk'),
  );

  const sidOpts = {
    path: '/',
    maxAge: FP_REF_MAX_AGE,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };

  // fp_sid: session identifier (not HttpOnly - JS may read for consistency)
  response.cookies.set('fp_sid', sessionId, sidOpts);

  // fp_ref: attribution reference cookie.
  // Only set when the override rule does NOT suppress it.
  if (!suppressVendorCookie && clickResult.referralLinkId && clickResult.clickId) {
    const fpRef = `${clickResult.referralLinkId}|${clickResult.clickId}|${Date.now()}`;
    response.cookies.set('fp_ref', fpRef, {
      path: '/',
      maxAge: FP_REF_MAX_AGE,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
    });
  }

  return response;
}

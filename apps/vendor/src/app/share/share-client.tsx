'use client';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { Check, Copy, Download, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { useTrackEvent } from '@/hooks/use-track-event';

interface ReferralLink {
  id: string;
  slug: string;
  referralUrl: string;
  qrUrls: { png: string; svg: string } | null;
  createdAt: string;
}

interface SourceCount {
  orders: number;
  gmvPence: number;
}

interface SplitData {
  thisWeek: Record<string, SourceCount | undefined>;
  cumulative: Record<string, SourceCount | undefined>;
}

interface ShareAndCustomersClientProps {
  link: ReferralLink | null;
  businessName: string;
  /** Vendor UUID threaded from the server page for analytics attribution. */
  vendorId: string;
}

const { vendorReferred, marketplaceFirst, marketplaceRepeat } = PLATFORM_FACTS.commission;

const INSTAGRAM_TEXT = (url: string, name: string) =>
  `Order directly from ${name} on Feastpot. When you use my personal link I pay ${vendorReferred}% commission - more of your money goes to the food, not fees.\nOrder here: ${url}`;

const WHATSAPP_TEXT = (url: string, name: string) =>
  `Hi! You can now order from ${name} directly on Feastpot. Use my link and I keep 100% of your food cost - I pay ${vendorReferred}% commission when orders come through here.\nTap to order: ${url}`;

function formatGbp(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function SourceBar({
  label,
  count,
  gmv,
  total,
}: {
  label: string;
  count: number;
  gmv: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-dark">{label}</span>
        <span className="text-mid">
          {count} orders · {formatGbp(gmv)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-teal transition-all"
          style={{ width: `${pct}%` }}
          aria-label={`${pct}%`}
        />
      </div>
      <p className="text-right text-xs text-mid">{pct}%</p>
    </div>
  );
}

export function ShareAndCustomersClient({
  link: initialLink,
  businessName,
  vendorId,
}: ShareAndCustomersClientProps) {
  const { token } = useAccessToken() as { token: string | null; loading: boolean };
  const track = useTrackEvent();
  const [link, setLink] = useState<ReferralLink | null>(initialLink);
  const [split, setSplit] = useState<SplitData | null>(null);
  const [splitStatus, setSplitStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Client-side QR data URL: generated instantly when stored Supabase URL is not
  // yet available (self-healing fallback). Renders in < 100 ms.
  const [clientQrDataUrl, setClientQrDataUrl] = useState<string | null>(null);

  // The QR URL embeds &m=qr so the /v/[slug] handler can fire a qr_scan analytics
  // event distinguishable from a plain link click.
  const qrLink = link ? `${link.referralUrl}?m=qr` : null;

  // Generate client-side QR immediately when stored URLs are missing.
  useEffect(() => {
    if (link?.qrUrls || !qrLink) return;
    let cancelled = false;
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(qrLink, {
          errorCorrectionLevel: 'H',
          margin: 4,
          width: 400,
          color: { dark: '#000000', light: '#ffffff' },
        }),
      )
      .then((dataUrl) => {
        if (!cancelled) setClientQrDataUrl(dataUrl);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link?.qrUrls, qrLink]);

  // Single background refresh: once the API has finished generating the stored QR,
  // replace the client-side render with the stored high-res URL.
  const bgRefreshFired = useRef(false);
  useEffect(() => {
    if (!token || link?.qrUrls || bgRefreshFired.current) return;
    bgRefreshFired.current = true;
    const timer = setTimeout(async () => {
      try {
        const fresh = await apiRequest<ReferralLink>('/attribution/links/me', {
          accessToken: token,
        });
        if (fresh.qrUrls) setLink(fresh);
      } catch {
        /* no-op */
      }
    }, 5_000);
    return () => clearTimeout(timer);
  }, [token, link?.qrUrls]);

  // Fetch order source split.
  useEffect(() => {
    if (!token) return;
    apiRequest<SplitData>('/attribution/vendor-split', { accessToken: token })
      .then((d) => {
        setSplit(d);
        setSplitStatus('ok');
      })
      .catch(() => setSplitStatus('error'));
  }, [token]);

  function copyToClipboard(text: string, key: string, method: string) {
    navigator.clipboard.writeText(text).catch(() => null);
    setCopied(key);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
    track('share_link_click', { method }, vendorId);
  }

  if (!link) {
    return (
      <p className="text-sm text-mid">
        Your referral link is not ready yet. Please refresh the page in a moment.
      </p>
    );
  }

  const qrSrc = link.qrUrls?.png ?? clientQrDataUrl;
  const qrBasename = `${link.slug}-feastpot-qr`;

  const weekTotal = split
    ? Object.values(split.thisWeek).reduce((s, v) => s + (v?.orders ?? 0), 0)
    : 0;
  const allTotal = split
    ? Object.values(split.cumulative).reduce((s, v) => s + (v?.orders ?? 0), 0)
    : 0;

  return (
    <div className="space-y-8">
      {/* ── Canonical link ───────────────────────────────────────────────── */}
      <section aria-labelledby="share-link-heading">
        <h2
          id="share-link-heading"
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-mid"
        >
          Your share link
        </h2>
        <div className="rounded-xl border border-border bg-white p-3">
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate font-mono text-sm text-dark">{link.referralUrl}</span>
            <button
              type="button"
              onClick={() => copyToClipboard(link.referralUrl, 'link', 'link_copy')}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-dark"
            >
              {copied === 'link' ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
              {copied === 'link' ? 'Copied' : 'Copy'}
            </button>
            <a
              href={link.referralUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-mid hover:bg-surface"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Test
            </a>
          </div>
          <p className="mt-2 text-[11px] text-mid">
            Orders placed via this link are attributed to you at{' '}
            <span className="font-semibold text-teal-dark">{vendorReferred}% commission</span> and
            tracked separately so you can see the impact of your own marketing.
          </p>
        </div>
      </section>

      {/* ── QR code ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="qr-heading">
        <h2 id="qr-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-mid">
          QR code
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Preview */}
          <div className="shrink-0">
            {qrSrc ? (
              <img
                src={qrSrc}
                alt={`QR code for ${link.referralUrl}`}
                width={160}
                height={160}
                className="h-40 w-40 rounded-xl border border-border bg-white p-2"
              />
            ) : (
              <div
                aria-label="QR code loading"
                className="h-40 w-40 animate-pulse rounded-xl border border-border bg-surface"
              />
            )}
          </div>

          {/* Downloads */}
          <div className="space-y-3">
            <p className="text-sm text-mid">
              High error-correction QR (H level) - scans reliably when printed small or placed on
              packaging. Download and print for menus, flyers, and events.
            </p>
            <div className="flex flex-wrap gap-2">
              {link.qrUrls ? (
                <>
                  <a
                    href={link.qrUrls.png}
                    download={`${qrBasename}.png`}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-dark transition-colors hover:bg-surface"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    PNG (high-res)
                  </a>
                  <a
                    href={link.qrUrls.svg}
                    download={`${qrBasename}.svg`}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-dark transition-colors hover:bg-surface"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    SVG (scalable)
                  </a>
                </>
              ) : clientQrDataUrl ? (
                // Stored high-res assets are being generated; offer the instant
                // client-rendered PNG as a download in the meantime.
                <a
                  href={clientQrDataUrl}
                  download={`${qrBasename}.png`}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-dark transition-colors hover:bg-surface"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  PNG
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ── Ready-to-use share text ──────────────────────────────────────── */}
      <section aria-labelledby="share-text-heading">
        <h2
          id="share-text-heading"
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-mid"
        >
          Ready-to-use share text
        </h2>
        <p className="mb-3 text-sm text-mid">
          Copy and paste into your socials. Both blocks include your link and make it clear that
          orders through it are direct, with no commission fee.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              key: 'ig',
              label: '📸 Instagram bio',
              text: INSTAGRAM_TEXT(link.referralUrl, businessName),
            },
            {
              key: 'wa',
              label: '💬 WhatsApp status',
              text: WHATSAPP_TEXT(link.referralUrl, businessName),
            },
          ].map(({ key, label, text }) => (
            <div key={key} className="rounded-xl border border-border bg-white p-4">
              <p className="mb-2 text-xs font-semibold text-mid">{label}</p>
              <p className="whitespace-pre-line text-sm text-dark">{text}</p>
              <button
                type="button"
                onClick={() => copyToClipboard(text, key, `${key}_copy`)}
                className="mt-3 flex items-center gap-1.5 text-xs font-medium text-teal hover:text-teal-dark"
              >
                {copied === key ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
                {copied === key ? 'Copied!' : 'Copy text'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Order source breakdown ───────────────────────────────────────── */}
      <section aria-labelledby="split-heading">
        <h2
          id="split-heading"
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-mid"
        >
          Order source breakdown
        </h2>
        {splitStatus === 'loading' ? (
          <div
            className="h-32 animate-pulse rounded-xl bg-surface"
            aria-busy="true"
            aria-label="Loading order source data"
          />
        ) : splitStatus === 'error' ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Could not load order source data. Please refresh to try again.
          </div>
        ) : split && (allTotal > 0 || weekTotal > 0) ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* This week */}
            <div className="rounded-xl border border-border bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-dark">This week</p>
              {weekTotal === 0 ? (
                <p className="text-sm text-mid">No delivered orders this week yet.</p>
              ) : (
                <div className="space-y-4">
                  <SourceBar
                    label="Via your link"
                    count={split.thisWeek['VENDOR_REFERRED']?.orders ?? 0}
                    gmv={split.thisWeek['VENDOR_REFERRED']?.gmvPence ?? 0}
                    total={weekTotal}
                  />
                  <SourceBar
                    label="New marketplace customers"
                    count={split.thisWeek['MARKETPLACE_FIRST']?.orders ?? 0}
                    gmv={split.thisWeek['MARKETPLACE_FIRST']?.gmvPence ?? 0}
                    total={weekTotal}
                  />
                  <SourceBar
                    label="Returning marketplace customers"
                    count={split.thisWeek['MARKETPLACE_REPEAT']?.orders ?? 0}
                    gmv={split.thisWeek['MARKETPLACE_REPEAT']?.gmvPence ?? 0}
                    total={weekTotal}
                  />
                </div>
              )}
            </div>
            {/* All time */}
            <div className="rounded-xl border border-border bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-dark">All time</p>
              {allTotal === 0 ? (
                <p className="text-sm text-mid">No delivered orders yet.</p>
              ) : (
                <div className="space-y-4">
                  <SourceBar
                    label="Via your link"
                    count={split.cumulative['VENDOR_REFERRED']?.orders ?? 0}
                    gmv={split.cumulative['VENDOR_REFERRED']?.gmvPence ?? 0}
                    total={allTotal}
                  />
                  <SourceBar
                    label="New marketplace customers"
                    count={split.cumulative['MARKETPLACE_FIRST']?.orders ?? 0}
                    gmv={split.cumulative['MARKETPLACE_FIRST']?.gmvPence ?? 0}
                    total={allTotal}
                  />
                  <SourceBar
                    label="Returning marketplace customers"
                    count={split.cumulative['MARKETPLACE_REPEAT']?.orders ?? 0}
                    gmv={split.cumulative['MARKETPLACE_REPEAT']?.gmvPence ?? 0}
                    total={allTotal}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="rounded-xl border border-border bg-white p-5">
            <p className="mb-4 text-sm text-mid">
              No orders yet. Once customers order through your link, you will see how many came from
              your own marketing versus Feastpot discovery here.
            </p>
            <table className="w-full text-sm" aria-label="Order source breakdown placeholder">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 text-left text-xs font-semibold text-mid">
                    Source
                  </th>
                  <th scope="col" className="py-2 text-right text-xs font-semibold text-mid">
                    Orders
                  </th>
                  <th scope="col" className="py-2 text-right text-xs font-semibold text-mid">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-2 text-mid">Feastpot marketplace</td>
                  <td className="py-2 text-right text-mid">0</td>
                  <td className="py-2 text-right text-mid">£0.00</td>
                </tr>
                <tr>
                  <td className="py-2 text-mid">Via your link</td>
                  <td className="py-2 text-right text-mid">0</td>
                  <td className="py-2 text-right text-mid">£0.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-teal/30 bg-teal-light p-5">
        <h2 className="mb-2 text-sm font-bold text-dark">How it works</h2>
        <ul className="space-y-1.5 text-sm text-dark">
          <li>
            <span className="font-semibold">Share your link</span> - post it on Instagram, WhatsApp,
            or anywhere you promote your kitchen.
          </li>
          <li>
            <span className="font-semibold">Customers order via your link</span> - Feastpot
            recognises the link and marks the order as coming from you.
          </li>
          <li>
            <span className="font-semibold">{vendorReferred}% commission</span> - orders attributed
            to your link attract {vendorReferred}% commission. Marketplace orders attract{' '}
            {marketplaceFirst}% for first-time customers and {marketplaceRepeat}% for repeat
            customers.
          </li>
          <li>
            <span className="font-semibold">See the results</span> - the order source breakdown
            above shows your own-referral orders versus marketplace orders, with revenue for each.
          </li>
        </ul>
      </section>
    </div>
  );
}

'use client';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { Check, Copy, Download, ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useAccessToken } from '@/lib/auth/use-access-token';
import { API_URL } from '@/lib/env';
import { useTrackEvent } from '@/hooks/use-track-event';

interface ShareClientProps {
  canonicalLink: string;
  slug: string;
  businessName: string;
  /** Vendor UUID: threaded to analytics so share_link_click events are tied to the vendor. */
  vendorId: string;
}

const commissionPct = PLATFORM_FACTS.commission.vendorReferred; // 0.0

const INSTAGRAM_TEXT = (link: string, name: string) =>
  `Order directly from ${name} on Feastpot. When you use my personal link I pay ${commissionPct}% commission - more of your money goes to the food, not fees.\nOrder here: ${link}`;

const WHATSAPP_TEXT = (link: string, name: string) =>
  `Hi! You can now order from ${name} directly on Feastpot. Use my link and I keep 100% of your food cost - I pay ${commissionPct}% commission when orders come through here.\nTap to order: ${link}`;

export function ShareClient({ canonicalLink, slug, businessName, vendorId }: ShareClientProps) {
  const { token } = useAccessToken();
  const track = useTrackEvent();
  const [copied, setCopied] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pngBusy, setPngBusy] = useState(false);
  const [svgBusy, setSvgBusy] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // QR codes encode a distinct URL with &m=qr so that when a customer scans
  // the code, the /v/[slug]/route.ts handler can detect it and fire a
  // server-side qr_scan analytics event (distinguishable from a plain link
  // click which has ?src=vendor but no &m=qr).
  const qrLink = `${canonicalLink}&m=qr`;

  // Generate client-side QR for instant preview. Uses qrLink (not canonicalLink)
  // so the preview matches what is printed/shared. If the vendor's slug ever
  // changes the server re-renders and passes the new canonicalLink, which
  // re-triggers this effect and regenerates the preview automatically.
  useEffect(() => {
    let cancelled = false;
    async function gen() {
      try {
        // Dynamic import keeps qrcode out of the server bundle (it uses
        // canvas / Buffer APIs unavailable in the Next.js Edge runtime).
        const QRCode = await import('qrcode');
        const dataUrl = await QRCode.toDataURL(qrLink, {
          errorCorrectionLevel: 'H',
          margin: 4,
          width: 400,
          color: { dark: '#000000', light: '#ffffff' },
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        // Non-fatal - download buttons still work via the API.
      }
    }
    void gen();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrLink]);

  function copyToClipboard(text: string, key: string, method: string) {
    navigator.clipboard.writeText(text).catch(() => null);
    setCopied(key);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
    // share_link_click: vendor actively sharing their link or social copy text.
    // Fire-and-forget; never blocks the copy action.
    track('share_link_click', { method }, vendorId);
  }

  async function downloadQr(format: 'png' | 'svg') {
    if (!token) return;
    const setBusy = format === 'png' ? setPngBusy : setSvgBusy;
    setBusy(true);
    setDlError(null);
    try {
      const res = await fetch(`${API_URL}/v1/vendors/me/qr?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}-feastpot-share.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Canonical link */}
      <section aria-labelledby="share-link-heading">
        <h2
          id="share-link-heading"
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-mid"
        >
          Your share link
        </h2>
        <div className="rounded-xl border border-border bg-white p-3">
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate font-mono text-sm text-dark">{canonicalLink}</span>
            <button
              type="button"
              onClick={() => copyToClipboard(canonicalLink, 'link', 'link_copy')}
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
              href={canonicalLink}
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
            <span className="font-semibold text-teal-dark">{commissionPct}% commission</span> -
            tracked separately so you can see the impact of your marketing.
          </p>
        </div>
      </section>

      {/* QR code */}
      <section aria-labelledby="qr-heading">
        <h2
          id="qr-heading"
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-mid"
        >
          QR code
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Preview */}
          <div className="shrink-0">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for ${canonicalLink}`}
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
              High error-correction QR (H level) - scans reliably when printed small or
              placed on packaging. Download and print for menus, flyers, and events.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void downloadQr('png')}
                disabled={pngBusy || !token}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-dark transition-colors hover:bg-surface disabled:opacity-60"
              >
                {pngBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden />
                )}
                {pngBusy ? 'Preparing...' : 'PNG (1024 px)'}
              </button>
              <button
                type="button"
                onClick={() => void downloadQr('svg')}
                disabled={svgBusy || !token}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-dark transition-colors hover:bg-surface disabled:opacity-60"
              >
                {svgBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden />
                )}
                {svgBusy ? 'Preparing...' : 'SVG (scalable)'}
              </button>
            </div>
            {dlError && <p className="text-xs text-red-600">{dlError}</p>}
          </div>
        </div>
      </section>

      {/* Share text */}
      <section aria-labelledby="share-text-heading">
        <h2
          id="share-text-heading"
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-mid"
        >
          Ready-to-use share text
        </h2>
        <p className="mb-3 text-sm text-mid">
          Copy and paste into your socials. Both blocks include your link and make
          it clear that orders through it are direct, with no commission fee.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              key: 'ig',
              label: 'Instagram bio',
              text: INSTAGRAM_TEXT(canonicalLink, businessName),
            },
            {
              key: 'wa',
              label: 'WhatsApp status',
              text: WHATSAPP_TEXT(canonicalLink, businessName),
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

      {/* How it works explainer */}
      <section className="rounded-xl border border-teal/30 bg-teal-light p-5">
        <h2 className="mb-2 text-sm font-bold text-dark">How it works</h2>
        <ul className="space-y-1.5 text-sm text-dark">
          <li>
            <span className="font-semibold">Share your link</span> - post it on Instagram, WhatsApp,
            or anywhere you promote your kitchen.
          </li>
          <li>
            <span className="font-semibold">Customers order via your link</span> - the{' '}
            <code className="rounded bg-white px-1 py-0.5 text-[11px]">?src=vendor</code> marker
            tracks that the order came from you.
          </li>
          <li>
            <span className="font-semibold">{commissionPct}% commission</span> - orders attributed
            to your link attract {PLATFORM_FACTS.commission.vendorReferred}% commission versus the
            standard {PLATFORM_FACTS.commission.marketplaceFirst}% marketplace rate.
          </li>
          <li>
            <span className="font-semibold">See the results</span> - the Earnings and Referrals
            pages show a breakdown of your own-referral orders versus marketplace orders.
          </li>
        </ul>
      </section>
    </div>
  );
}

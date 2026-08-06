'use client';

import { Check, Copy, Download, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

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
  thisWeek: { MARKETPLACE: SourceCount; VENDOR_REFERRED: SourceCount };
  cumulative: { MARKETPLACE: SourceCount; VENDOR_REFERRED: SourceCount };
}

interface ReferralsClientProps {
  link: ReferralLink | null;
}

const INSTAGRAM_TEXT = (url: string) =>
  `Order my food directly via Feastpot 🍱\n${url}`;

const WHATSAPP_TEXT = (url: string) =>
  `Hey! You can now order directly from me on Feastpot 🎉 Use my link: ${url}`;

function formatGbp(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function SourceBar({ label, count, gmv, total }: { label: string; count: number; gmv: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-dark">{label}</span>
        <span className="text-mid">{count} orders · {formatGbp(gmv)}</span>
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

export function ReferralsClient({ link: initialLink }: ReferralsClientProps) {
  const { token } = useAccessToken() as { token: string | null; loading: boolean };
  const [link, setLink] = useState<ReferralLink | null>(initialLink);
  const [split, setSplit] = useState<SplitData | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If QR codes haven't generated yet (async after first link creation), poll once.
  useEffect(() => {
    if (!token || link?.qrUrls) return;
    const timer = setTimeout(async () => {
      try {
        const fresh = await apiRequest<ReferralLink>('/attribution/links/me', { accessToken: token });
        setLink(fresh);
      } catch { /* no-op */ }
    }, 4000);
    return () => clearTimeout(timer);
  }, [token, link?.qrUrls]);

  // Fetch source split.
  useEffect(() => {
    if (!token) return;
    apiRequest<SplitData>('/attribution/vendor-split', { accessToken: token })
      .then(setSplit)
      .catch(() => null);
  }, [token]);

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => null);
    setCopied(key);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), 2000);
  }

  if (!link) return <p className="text-sm text-mid">No referral link found. Please refresh.</p>;

  const weekTotal = split
    ? (split.thisWeek.MARKETPLACE?.orders ?? 0) + (split.thisWeek.VENDOR_REFERRED?.orders ?? 0)
    : 0;
  const allTotal = split
    ? (split.cumulative.MARKETPLACE?.orders ?? 0) + (split.cumulative.VENDOR_REFERRED?.orders ?? 0)
    : 0;

  return (
    <div className="space-y-8">
      {/* Referral URL */}
      <section aria-labelledby="ref-url-heading">
        <h2 id="ref-url-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-mid">
          Your referral link
        </h2>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-white p-3">
          <span className="flex-1 truncate font-mono text-sm text-dark">{link.referralUrl}</span>
          <button
            type="button"
            onClick={() => copyToClipboard(link.referralUrl, 'url')}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-dark"
          >
            {copied === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === 'url' ? 'Copied' : 'Copy'}
          </button>
          <a
            href={link.referralUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-mid hover:bg-surface"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Test
          </a>
        </div>
      </section>

      {/* QR Code */}
      <section aria-labelledby="qr-heading">
        <h2 id="qr-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-mid">
          QR code
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {link.qrUrls ? (
            <img
              src={link.qrUrls.png}
              alt={`QR code for ${link.referralUrl}`}
              className="h-40 w-40 rounded-xl border border-border bg-white p-2"
            />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-xl border border-border bg-surface">
              <span className="text-xs text-mid">Generating…</span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-sm text-mid">Download and print for menus, packaging, or events.</p>
            {link.qrUrls && (
              <div className="flex gap-2">
                <a
                  href={link.qrUrls.png}
                  download={`feastpot-qr-${link.slug}.png`}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-dark hover:bg-surface"
                >
                  <Download className="h-3.5 w-3.5" />
                  PNG
                </a>
                <a
                  href={link.qrUrls.svg}
                  download={`feastpot-qr-${link.slug}.svg`}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-dark hover:bg-surface"
                >
                  <Download className="h-3.5 w-3.5" />
                  SVG
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Share text */}
      <section aria-labelledby="share-heading">
        <h2 id="share-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-mid">
          Ready-to-use share text
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { key: 'ig', label: '📸 Instagram bio', text: INSTAGRAM_TEXT(link.referralUrl) },
            { key: 'wa', label: '💬 WhatsApp message', text: WHATSAPP_TEXT(link.referralUrl) },
          ].map(({ key, label, text }) => (
            <div key={key} className="rounded-xl border border-border bg-white p-4">
              <p className="mb-2 text-xs font-semibold text-mid">{label}</p>
              <p className="whitespace-pre-line text-sm text-dark">{text}</p>
              <button
                type="button"
                onClick={() => copyToClipboard(text, key)}
                className="mt-3 flex items-center gap-1.5 text-xs font-medium text-teal hover:text-teal-dark"
              >
                {copied === key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === key ? 'Copied!' : 'Copy text'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Source split */}
      <section aria-labelledby="split-heading">
        <h2 id="split-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-mid">
          Order source breakdown
        </h2>
        {split ? (
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
                    count={split.thisWeek.VENDOR_REFERRED?.orders ?? 0}
                    gmv={split.thisWeek.VENDOR_REFERRED?.gmvPence ?? 0}
                    total={weekTotal}
                  />
                  <SourceBar
                    label="Feastpot marketplace"
                    count={split.thisWeek.MARKETPLACE?.orders ?? 0}
                    gmv={split.thisWeek.MARKETPLACE?.gmvPence ?? 0}
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
                    count={split.cumulative.VENDOR_REFERRED?.orders ?? 0}
                    gmv={split.cumulative.VENDOR_REFERRED?.gmvPence ?? 0}
                    total={allTotal}
                  />
                  <SourceBar
                    label="Feastpot marketplace"
                    count={split.cumulative.MARKETPLACE?.orders ?? 0}
                    gmv={split.cumulative.MARKETPLACE?.gmvPence ?? 0}
                    total={allTotal}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-32 animate-pulse rounded-xl bg-surface" />
        )}
      </section>
    </div>
  );
}

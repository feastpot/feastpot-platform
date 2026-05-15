/**
 * Brand-styled email layout helpers for transactional emails.
 *
 * The styling is deliberately inline (not class-based) because
 * email clients (Gmail, Outlook, Apple Mail) strip <style> blocks
 * and class selectors unpredictably. Inline + table-based layouts
 * are the only reliably-portable approach.
 *
 * Brand tokens (kept in sync with @feastpot/ui/theme.css):
 *   - brand orange: #E8520A
 *   - teal:         #1D9E75
 *   - vendor blue:  #185FA5
 *   - ink:          #1C1C1A
 *   - mute:         #5F5E5A
 *   - paper:        #F8F7F5
 *   - hairline:     #EDEDEA
 */

import { LEGAL } from '../../../lib/legal-constants';

export const BRAND = {
  orange: '#E8520A',
  teal: '#1D9E75',
  vendorBlue: '#185FA5',
  ink: '#1C1C1A',
  mute: '#5F5E5A',
  muteSoft: '#888780',
  hairline: '#EDEDEA',
  paper: '#F8F7F5',
  amberBg: '#FEF6E7',
  amberBorder: '#F5C36C',
} as const;

const FONT_STACK = `Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

/** Wraps body HTML in the standard branded shell (header + footer). */
export function baseLayout(title: string, body: string, preheader = ''): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;color:transparent">${escapeHtml(preheader)}</div>` : ''}
</head>
<body style="margin:0;padding:0;background:${BRAND.paper};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased">
<div style="max-width:600px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(28,28,26,.08)">
  <div style="background:${BRAND.orange};padding:20px 28px">
    <span style="color:#ffffff;font-size:26px;font-weight:900;letter-spacing:-1.5px">feast</span><span style="color:rgba(255,255,255,.75);font-size:26px;font-weight:900;letter-spacing:-1.5px">pot</span>
  </div>
  <div style="padding:28px 28px 24px">${body}</div>
  <div style="background:${BRAND.paper};padding:16px 28px;border-top:1px solid ${BRAND.hairline}">
    <p style="margin:0 0 4px;font-size:12px;color:${BRAND.muteSoft}">Feastpot · feastpot.co.uk · ${LEGAL.SUPPORT_EMAIL}</p>
    <p style="margin:0;font-size:11px;color:#BDBBB7">ICO Registration: ${LEGAL.ICO_NUMBER} · ${LEGAL.COMPANY_NAME} · England &amp; Wales</p>
  </div>
</div>
</body></html>`;
}

/** Primary CTA button (brand orange). Pass `color: 'teal'` for the alt accent. */
export function brandButton(text: string, url: string, color: 'orange' | 'teal' | 'vendorBlue' = 'orange'): string {
  const bg = BRAND[color];
  return `<div style="margin:20px 0"><a href="${escapeAttr(url)}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:15px">${escapeHtml(text)}</a></div>`;
}

export function h2(text: string): string {
  return `<h2 style="margin:0 0 12px;font-size:22px;font-weight:800;color:${BRAND.ink};letter-spacing:-.5px">${escapeHtml(text)}</h2>`;
}

export function p(text: string, color: string = BRAND.mute): string {
  return `<p style="margin:0 0 12px;font-size:15px;color:${color};line-height:1.6">${text}</p>`;
}

/** Amber callout box for warnings (e.g. expiring documents, dispute deadlines). */
export function amberCallout(html: string): string {
  return `<div style="margin:16px 0;padding:14px 16px;background:${BRAND.amberBg};border:1px solid ${BRAND.amberBorder};border-radius:8px;font-size:14px;color:${BRAND.ink};line-height:1.5">${html}</div>`;
}

/** Teal pill for positive callouts (loyalty points, savings). */
export function tealPill(text: string): string {
  return `<span style="display:inline-block;background:${BRAND.teal};color:#ffffff;font-weight:700;font-size:13px;padding:4px 10px;border-radius:999px">${escapeHtml(text)}</span>`;
}

/** Two-column key/value row used in summaries (totals, ETA, scheduled time). */
export function keyValueRow(key: string, value: string, opts?: { bold?: boolean }): string {
  const valueWeight = opts?.bold ? '700' : '500';
  return `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;color:${BRAND.ink}">
    <span style="color:${BRAND.mute}">${escapeHtml(key)}</span>
    <span style="font-weight:${valueWeight}">${escapeHtml(value)}</span>
  </div>`;
}

/** Itemised line table used in order-confirmation. */
export function itemsTable(items: Array<{ name: string; qty: number; pricePence: number }>): string {
  const rows = items
    .map((it) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid ${BRAND.hairline};font-size:14px;color:${BRAND.ink}">${escapeHtml(it.name)}</td>
      <td style="padding:8px 0;border-bottom:1px solid ${BRAND.hairline};font-size:14px;color:${BRAND.mute};text-align:center;width:50px">×${it.qty}</td>
      <td style="padding:8px 0;border-bottom:1px solid ${BRAND.hairline};font-size:14px;color:${BRAND.ink};text-align:right;width:80px">${formatMoney(it.pricePence * it.qty)}</td>
    </tr>`)
    .join('');
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:12px 0">${rows}</table>`;
}

export function formatMoney(pence: unknown): string {
  if (typeof pence !== 'number' || !Number.isFinite(pence)) return '—';
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * HTML-escape a string for safe interpolation inside an HTML body.
 *
 * Exported because templates that pass user-controlled fields into the
 * non-escaping helpers (`p`, `amberCallout`) — or into raw HTML strings
 * like `<blockquote>${...}</blockquote>` — must escape at the call site.
 * Helpers whose input is HTML-by-contract (`p`, `amberCallout`) keep
 * their loose typing so callers can still embed `<strong>` etc.
 */
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

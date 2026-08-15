'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { BenefitsStrip } from './benefits-strip';

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterLegalInfo {
  companyName: string;
  registeredIn: string;
  icoNumber: string;
  supportEmail: string;
}

export interface FooterSocialLink {
  platform: 'x' | 'instagram' | 'tiktok';
  href: string;
}

interface FooterProps {
  legalInfo: FooterLegalInfo;
  links: FooterLink[];
  /** Social media links shown as icons above the legal bar. */
  socialLinks?: FooterSocialLink[];
  /** Pathnames on which the footer is suppressed (default: none). */
  hiddenOn?: string[];
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06Z" />
    </svg>
  );
}

const SOCIAL_ICONS = {
  x: XIcon,
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
} as const;

const SOCIAL_LABELS = {
  x: 'X (Twitter)',
  instagram: 'Instagram',
  tiktok: 'TikTok',
} as const;

/**
 * Shared site footer used across all customer-facing web pages.
 * Extracted to @feastpot/ui so every app ships the same footer with
 * the same legal links, satisfying the P2B requirement that legal
 * documents are persistently discoverable on every page.
 *
 * D2 fix: single component, pass legalInfo + links from the host app.
 */
export function Footer({ legalInfo, links, socialLinks, hiddenOn = [] }: FooterProps) {
  const pathname = usePathname() ?? '/';
  if (hiddenOn.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <footer
      className="mt-8 bg-cream"
      style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom) + 64px)' }}
    >
      <BenefitsStrip />

      <div className="mx-auto max-w-5xl px-4 pt-6">
        {/* Vendor recruitment card */}
        <div className="mb-5 flex flex-col items-start justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-light p-4 md:flex-row md:items-center">
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-charcoal">Cook from home? Join Feastpot</p>
            <p className="mt-0.5 text-[12px] font-medium text-charcoal-mid">
              Sell party trays, family pots and weekly meals to customers near you. Keep your food
              business moving without chasing DMs.
            </p>
          </div>
          <Link
            href="/become-a-vendor"
            className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-brand-dark"
          >
            Join Feastpot
          </Link>
        </div>

        {/* Two-column legal/help link grid */}
        <ul className="mb-5 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block py-0.5 text-[12px] font-medium text-charcoal-mid transition-colors hover:text-charcoal"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="border-t border-cream-deep pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium text-charcoal-light">
                &copy; 2026 {legalInfo.companyName} &middot; {legalInfo.registeredIn}
              </p>
              <p className="mt-1 text-[11px] font-medium text-charcoal-light">
                ICO Registration {legalInfo.icoNumber} &middot;{' '}
                <a href={`mailto:${legalInfo.supportEmail}`} className="hover:text-charcoal-mid">
                  {legalInfo.supportEmail}
                </a>
              </p>
            </div>

            {socialLinks && socialLinks.length > 0 && (
              <div className="flex items-center gap-3">
                {socialLinks.map(({ platform, href }) => {
                  const Icon = SOCIAL_ICONS[platform];
                  return (
                    <a
                      key={platform}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={SOCIAL_LABELS[platform]}
                      className="text-charcoal-light transition-colors hover:text-charcoal"
                    >
                      <Icon />
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

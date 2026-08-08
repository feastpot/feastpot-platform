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

interface FooterProps {
  legalInfo: FooterLegalInfo;
  links: FooterLink[];
  /** Pathnames on which the footer is suppressed (default: none). */
  hiddenOn?: string[];
}

/**
 * Shared site footer used across all customer-facing web pages.
 * Extracted to @feastpot/ui so every app ships the same footer with
 * the same legal links, satisfying the P2B requirement that legal
 * documents are persistently discoverable on every page.
 *
 * D2 fix: single component, pass legalInfo + links from the host app.
 */
export function Footer({ legalInfo, links, hiddenOn = [] }: FooterProps) {
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
            <p className="text-[14px] font-bold text-charcoal">Cook from home? Join FeastPot</p>
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
      </div>
    </footer>
  );
}

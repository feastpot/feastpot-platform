'use client';

/**
 * Web-app footer: thin wrapper around the shared @feastpot/ui Footer.
 * All legal links are enumerated here so they live in one place and
 * are inherited by every layout that mounts this component.
 *
 * D2 fix: Footer component extracted to packages/ui; this file configures
 * it with the web app's LEGAL constants and route list.
 */
import { Footer as UiFooter } from '@feastpot/ui/footer';
import type { FooterSocialLink } from '@feastpot/ui/footer';

import { LEGAL } from '@/lib/legal-constants';

const FOOTER_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Vendors', href: '/vendors' },
  { label: 'Help & FAQ', href: '/help' },
  { label: 'Catering', href: '/catering' },
  { label: 'Become a vendor', href: '/become-a-vendor' },
  { label: 'Vendor readiness', href: '/vendor-readiness' },
  { label: 'Trust and safety', href: '/trust' },
  { label: 'Privacy Policy', href: '/legal/privacy' },
  { label: 'Terms of Service', href: '/legal/terms' },
  { label: 'Cookie Policy', href: '/legal/cookies' },
  { label: 'Allergen info', href: '/legal/allergens' },
  { label: 'Vendor Terms', href: '/legal/vendor-terms' },
];

const LEGAL_INFO = {
  companyName: LEGAL.COMPANY_NAME,
  registeredIn: LEGAL.REGISTERED_IN,
  icoNumber: LEGAL.ICO_NUMBER,
  supportEmail: LEGAL.SUPPORT_EMAIL,
};

const SOCIAL_LINKS: FooterSocialLink[] = [
  { platform: 'x', href: 'https://x.com/feastpot' },
  { platform: 'instagram', href: 'https://www.instagram.com/feastpot.co.uk' },
  { platform: 'tiktok', href: 'https://www.tiktok.com/@feastpot.co.uk?lang=en-GB' },
];

export function Footer() {
  return (
    <UiFooter
      legalInfo={LEGAL_INFO}
      links={FOOTER_LINKS}
      socialLinks={SOCIAL_LINKS}
      hiddenOn={['/checkout']}
    />
  );
}

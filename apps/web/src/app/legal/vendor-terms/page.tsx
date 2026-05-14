import type { Metadata } from 'next';

import {
  LegalContact,
  LegalContentWrapper,
  LegalHero,
  LegalLink,
  LegalPageShell,
  LegalQuickNav,
  LegalSection,
  legalListStyle,
} from '@/components/legal/legal-shell';

export const metadata: Metadata = {
  title: 'Vendor Terms of Service',
  description:
    'Vendor Terms of Service, your commercial agreement with Feastpot Ltd when you list and sell food on the platform.',
  alternates: { canonical: '/legal/vendor-terms' },
};

const ICO_NUMBER = 'ZC146267';

const QUICK_NAV = [
  { label: 'Relationship', href: '#relationship' },
  { label: 'Eligibility', href: '#eligibility' },
  { label: 'Commission', href: '#commission' },
  { label: 'Payouts', href: '#payouts' },
  { label: 'Compliance', href: '#compliance' },
  { label: 'Suspension', href: '#suspension' },
  { label: 'Liability', href: '#liability' },
  { label: 'Contact', href: '#contact' },
];

export default function VendorTermsPage() {
  return (
    <LegalPageShell>
      <LegalHero
        title="Vendor Terms"
        lede={
          <>
            Your commercial agreement with Feastpot Ltd when you list and sell food on the
            platform, clear commission, weekly payouts, plain rules.
          </>
        }
        footnote={<>Last updated: May 2026 &middot; England &amp; Wales</>}
      />

      <LegalQuickNav ariaLabel="Vendor terms sections" items={QUICK_NAV} />

      <LegalContentWrapper>
        <LegalSection id="relationship" icon="🤝" title="1. The vendor relationship">
          <p>
            By registering as a vendor on Feastpot, you enter into a commercial agreement with
            Feastpot Ltd. You are an independent business, not an employee or agent of Feastpot.
            You are solely responsible for your food, your kitchen, and your compliance with all
            applicable food law.
          </p>
        </LegalSection>

        <LegalSection id="eligibility" icon="✅" title="2. Eligibility">
          <p>To operate as a vendor you must:</p>
          <ul style={legalListStyle}>
            <li>Be registered as a business or sole trader in the UK;</li>
            <li>
              Hold a valid Food Business Registration under the Food Safety Act 1990 (register
              with your local authority, it is free and mandatory);
            </li>
            <li>
              Have a minimum Food Hygiene Rating Scheme (FHRS) rating of 3/5 (Feastpot recommends
              a minimum of 4/5 for listing on the platform);
            </li>
            <li>Hold valid public liability insurance (minimum &pound;1&nbsp;million cover);</li>
            <li>Comply with the Food Information Regulations 2014 (allergen labelling);</li>
            <li>Comply with Natasha&rsquo;s Law (PPDS Regulation 2021);</li>
            <li>Have a valid bank account (required for Stripe Connect payouts);</li>
            <li>Provide valid photo ID during onboarding.</li>
          </ul>
        </LegalSection>

        <LegalSection id="commission" icon="💷" title="3. Platform commission">
          <p>
            Feastpot charges a commission of <strong>12% of the order subtotal</strong>{' '}
            (excluding delivery fees) on each completed order. This commission is deducted from
            your weekly payout, it is not charged separately.
          </p>
          <p>
            Feastpot reserves the right to adjust the commission rate with 30 days&rsquo; written
            notice to active vendors.
          </p>
        </LegalSection>

        <LegalSection id="payouts" icon="🏦" title="4. Payouts">
          <p>
            Payouts are processed <strong>weekly, every Monday</strong>, for all orders delivered
            in the prior Monday&ndash;Sunday window. Payouts are made via Stripe Connect to your
            registered UK bank account.
          </p>
          <p>A payout will be held if:</p>
          <ul style={legalListStyle}>
            <li>A dispute is open against your account;</li>
            <li>Your compliance documents have expired;</li>
            <li>Your account is under review.</li>
          </ul>
          <p>Feastpot will notify you of any hold via email and the vendor dashboard.</p>
        </LegalSection>

        <LegalSection id="disputes" icon="⚖️" title="5. Refunds and disputes">
          <p>
            If a customer dispute results in a full or partial refund, the refunded amount (plus
            any applicable commission) will be deducted from your next payout. Vendors are
            expected to respond to dispute enquiries within 24 hours. Failure to respond will be
            treated as non-engagement and may result in a full refund to the customer at the
            vendor&rsquo;s cost. Feastpot&rsquo;s decision on disputes is final.
          </p>
        </LegalSection>

        <LegalSection id="compliance" icon="🛡️" title="6. Food safety and compliance">
          <p>You are solely responsible for:</p>
          <ul style={legalListStyle}>
            <li>The safety and quality of all food prepared and delivered;</li>
            <li>
              Correct allergen declaration for every menu item (Food Information Regulations 2014);
            </li>
            <li>Compliance with Natasha&rsquo;s Law for pre-packaged food;</li>
            <li>Maintaining your FHRS rating;</li>
            <li>
              Keeping your compliance documents current (hygiene certificate, insurance, FHRS).
            </li>
          </ul>
          <p>
            Feastpot may suspend your listing if compliance documents expire and are not renewed
            within 7 days of the first reminder.
          </p>
        </LegalSection>

        <LegalSection id="menu" icon="📋" title="7. Menu and pricing">
          <ul style={legalListStyle}>
            <li>You are responsible for keeping menu items, prices and availability accurate.</li>
            <li>You must not list items that contain undeclared allergens.</li>
            <li>Prices must be inclusive of VAT where applicable.</li>
            <li>Feastpot may remove menu items that receive repeated complaints.</li>
          </ul>
        </LegalSection>

        <LegalSection id="acceptance" icon="⏱️" title="8. Order acceptance">
          <p>
            You must accept or reject orders within 15 minutes of receipt. Failure to respond
            results in automatic order cancellation and a full refund to the customer. Repeated
            failures to accept orders may result in suspension. You must not accept orders you do
            not intend to fulfil.
          </p>
        </LegalSection>

        <LegalSection id="prohibited" icon="🚫" title="9. Prohibited conduct">
          <p>You must not:</p>
          <ul style={legalListStyle}>
            <li>Solicit customers to order off-platform;</li>
            <li>Misrepresent allergen information;</li>
            <li>List food you are not licensed or registered to sell;</li>
            <li>Request or accept cash payments for platform orders;</li>
            <li>Threaten, harass or intimidate customers.</li>
          </ul>
        </LegalSection>

        <LegalSection id="suspension" icon="🛑" title="10. Suspension and removal">
          <p>Feastpot may suspend or remove your listing immediately if:</p>
          <ul style={legalListStyle}>
            <li>You receive 3 or more substantiated complaints in 30 days;</li>
            <li>Your FHRS rating drops below 3;</li>
            <li>You fail a compliance document check;</li>
            <li>You engage in prohibited conduct;</li>
            <li>Your Stripe Connect account is flagged by Stripe.</li>
          </ul>
          <p>
            We will notify you of any suspension and the reason for it. Appeals must be submitted
            to{' '}
            <LegalLink href="mailto:compliance@feastpot.co.uk">
              compliance@feastpot.co.uk
            </LegalLink>{' '}
            within 7 days.
          </p>
        </LegalSection>

        <LegalSection id="ip" icon="📸" title="11. Intellectual property">
          <p>
            By uploading photos or content to Feastpot, you grant us a non-exclusive,
            royalty-free licence to use that content to promote the platform and your listing.
            You retain ownership of your content.
          </p>
        </LegalSection>

        <LegalSection id="liability" icon="⚠️" title="12. Liability">
          <p>Feastpot is not liable for:</p>
          <ul style={legalListStyle}>
            <li>Food safety incidents caused by the vendor;</li>
            <li>Customer illness resulting from allergen misrepresentation;</li>
            <li>Late or failed deliveries;</li>
            <li>Loss of income due to platform downtime.</li>
          </ul>
          <p>Nothing in these terms limits liability for gross negligence or fraud.</p>
        </LegalSection>

        <LegalSection id="law" icon="🏛️" title="13. Governing law">
          <p>These terms are governed by the laws of England and Wales.</p>
        </LegalSection>

        <LegalContact
          number="14"
          title="Contact"
          email="compliance@feastpot.co.uk"
          subject="Vendor enquiry"
          body={
            <>
              Subject line: &ldquo;Vendor enquiry&rdquo;.
              <br />
              We aim to respond within 5 business days.
            </>
          }
          meta={
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>
              ICO Registration: {ICO_NUMBER}
            </span>
          }
        />
      </LegalContentWrapper>
    </LegalPageShell>
  );
}

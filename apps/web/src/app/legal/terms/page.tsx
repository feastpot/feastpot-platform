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
  title: 'Terms of Service',
  description:
    'Feastpot customer Terms of Service, your contract with Feastpot Ltd when you place orders through our marketplace.',
  alternates: { canonical: '/legal/terms' },
};

const ICO_NUMBER = 'C1931679';

const QUICK_NAV = [
  { label: 'About', href: '#about' },
  { label: 'Your account', href: '#account' },
  { label: 'Orders', href: '#orders' },
  { label: 'Payment', href: '#payment' },
  { label: 'Refunds', href: '#refunds' },
  { label: 'Allergens', href: '#allergens' },
  { label: 'Liability', href: '#liability' },
  { label: 'Contact', href: '#contact' },
];

export default function TermsPage() {
  return (
    <LegalPageShell>
      <LegalHero
        title="Terms of Service"
        lede={
          <>
            The plain-English contract between you and Feastpot when you order through our
            marketplace. Same protections, friendlier read.
          </>
        }
        footnote={<>Last updated: May 2026 &middot; England &amp; Wales</>}
      />

      <LegalQuickNav ariaLabel="Terms of service sections" items={QUICK_NAV} />

      <LegalContentWrapper>
        <LegalSection id="about" icon="🏢" title="1. About Feastpot">
          <p>
            Feastpot is an online marketplace operated by Feastpot Ltd (England and Wales). We
            connect customers with independent food vendors. Feastpot is <strong>not</strong> a
            food business, caterer or restaurant. We are a marketplace operator and are not
            responsible for the preparation, quality or safety of food ordered through the
            platform.
          </p>
          <p>
            Feastpot is registered as a data controller with the ICO: <strong>{ICO_NUMBER}</strong>.
          </p>
        </LegalSection>

        <LegalSection id="accept" icon="✍️" title="2. Accepting these terms">
          <p>
            By creating an account or placing an order, you agree to these terms. You must be 18
            or over to create an account. These terms are governed by the laws of England and
            Wales.
          </p>
        </LegalSection>

        <LegalSection id="account" icon="👤" title="3. Your account">
          <ul style={legalListStyle}>
            <li>You are responsible for keeping your login credentials secure.</li>
            <li>You must provide accurate information during registration.</li>
            <li>One account per person.</li>
            <li>We may suspend accounts that violate these terms.</li>
          </ul>
        </LegalSection>

        <LegalSection id="orders" icon="🛒" title="4. Placing orders">
          <p>
            Orders are a contract between you (the customer) and the vendor, not Feastpot.
            Feastpot facilitates payment and provides the platform; we are not a party to the
            food supply contract.
          </p>
          <p>
            Orders are confirmed when the vendor accepts. Pending orders are held in escrow via
            Stripe and only captured when the vendor accepts. If a vendor does not accept within
            15 minutes, your order is automatically cancelled and a full refund is issued within
            5 business days.
          </p>
        </LegalSection>

        <LegalSection id="payment" icon="💳" title="5. Prices, fees and payment">
          <ul style={legalListStyle}>
            <li>All prices shown include VAT where applicable.</li>
            <li>Payment is processed by Stripe. Feastpot does not store card details.</li>
            <li>
              A platform service fee may be shown at checkout (currently &pound;0 for customers
             , Feastpot&rsquo;s 12% commission is deducted from vendors, not charged to
              customers).
            </li>
            <li>Stripe may apply transaction fees subject to their terms.</li>
          </ul>
        </LegalSection>

        <LegalSection id="delivery" icon="🛵" title="6. Delivery">
          <p>
            Delivery is performed by the vendor or a vendor-arranged courier, not by Feastpot.
            Delivery times are estimates. Feastpot is not liable for late deliveries caused by
            the vendor or by circumstances outside our control. You are responsible for providing
            an accurate delivery address.
          </p>
        </LegalSection>

        <LegalSection id="refunds" icon="↩️" title="7. Cancellations and refunds">
          <ul style={legalListStyle}>
            <li>
              <strong>Before vendor acceptance:</strong> full refund, no questions asked.
            </li>
            <li>
              <strong>After vendor acceptance:</strong> cancellations are at the vendor&rsquo;s
              discretion. Contact{' '}
              <LegalLink href="mailto:support@feastpot.co.uk">support@feastpot.co.uk</LegalLink>{' '}
              within 1 hour of acceptance.
            </li>
            <li>
              <strong>After delivery:</strong> if food is missing, wrong, or unfit for
              consumption, raise a dispute within 24 hours via the app or at{' '}
              <LegalLink href="mailto:support@feastpot.co.uk">support@feastpot.co.uk</LegalLink>.
            </li>
          </ul>
          <p>
            Feastpot will acknowledge customer disputes within 24 hours and resolve them within
            5&nbsp;business days. Approved refunds are processed within 5&nbsp;business days of
            resolution to your original payment method. Credit may be issued as an alternative at
            our discretion. Feastpot&rsquo;s decision on disputes is final.
          </p>
        </LegalSection>

        <LegalSection id="allergens" icon="⚠️" title="8. Allergens and dietary requirements">
          <p>
            Allergen information is provided by vendors and is{' '}
            <strong>not independently verified</strong> by Feastpot. If you have a severe
            allergy, contact the vendor directly before ordering. Feastpot cannot guarantee that
            any dish is allergen-free.
          </p>
          <p>
            In the event of a severe allergic reaction, call <strong>999</strong> immediately. The
            14 major allergens are listed at{' '}
            <LegalLink href="/legal/allergens">feastpot.co.uk/legal/allergens</LegalLink>.
          </p>
          <p>
            Vendors are required under the Food Information Regulations 2014 and Natasha&rsquo;s
            Law (PPDS Regulation 2021) to declare all 14 major allergens.
          </p>
        </LegalSection>

        <LegalSection id="reviews" icon="⭐" title="9. Reviews">
          <ul style={legalListStyle}>
            <li>Reviews must be genuine, based on your own experience, and not defamatory.</li>
            <li>We moderate reviews and may remove those that violate these terms.</li>
            <li>Vendors cannot pay for or solicit fake reviews.</li>
            <li>Reviews are subject to our moderation policy.</li>
          </ul>
        </LegalSection>

        <LegalSection id="prohibited" icon="🚫" title="10. Prohibited conduct">
          <p>You must not:</p>
          <ul style={legalListStyle}>
            <li>Use the platform for any unlawful purpose;</li>
            <li>Attempt to place orders off-platform to avoid platform fees;</li>
            <li>Harass, abuse or threaten vendors or Feastpot staff;</li>
            <li>Misrepresent your identity or payment information;</li>
            <li>Attempt to reverse-engineer, scrape or disrupt the platform.</li>
          </ul>
        </LegalSection>

        <LegalSection id="liability" icon="⚖️" title="11. Feastpot's role and liability">
          <p>
            Feastpot is a marketplace platform operator, not a food business. We are not liable
            for: the quality or safety of food; delivery delays; vendor non-performance; or
            events outside our reasonable control.
          </p>
          <p>
            Our maximum liability to you in any 12-month period is limited to the total fees paid
            by you to Feastpot in that period. Nothing in these terms limits our liability for
            death or personal injury caused by our negligence, for fraud, or for any liability
            that cannot be excluded by law (including your statutory rights under the Consumer
            Rights Act 2015).
          </p>
        </LegalSection>

        <LegalSection id="changes" icon="📢" title="12. Changes to these terms">
          <p>
            We will give 14 days&rsquo; notice of material changes via email. Continued use of
            the platform after the effective date constitutes acceptance.
          </p>
        </LegalSection>

        <LegalSection id="law" icon="🏛️" title="13. Governing law">
          <p>
            These terms are governed by the laws of <strong>England and Wales</strong>. Disputes
            shall be subject to the exclusive jurisdiction of the courts of England and Wales,
            unless you are a consumer in Scotland or Northern Ireland, in which case you may
            bring proceedings in your local court.
          </p>
        </LegalSection>

        <LegalContact
          number="14"
          title="Contact"
          email="support@feastpot.co.uk"
          subject="Terms enquiry"
          body={
            <>
              Subject line: &ldquo;Terms enquiry&rdquo;.
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

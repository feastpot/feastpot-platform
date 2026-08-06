import type { Metadata } from 'next';

import {
  LegalContact,
  LegalContentWrapper,
  LegalHero,
  LegalLink,
  LegalPageShell,
  LegalQuickNav,
  LegalSection,
  LegalTrustStrip,
  legalListStyle,
} from '@/components/legal/legal-shell';
import { LEGAL } from '@/lib/legal-constants';

export const metadata: Metadata = {
  title: 'Vendor Terms of Service',
  description:
    'Vendor Terms of Service, your commercial agreement with Feastpot Ltd when you list and sell food on the platform.',
  alternates: { canonical: '/legal/vendor-terms' },
};

const ICO_NUMBER = LEGAL.ICO_NUMBER;

/** Canonical commission rate -- keep in sync with become-a-vendor and help pages. */
export const VENDOR_COMMISSION_RATE_PCT = 12;

const QUICK_NAV = [
  { label: 'Relationship', href: '#relationship' },
  { label: 'Eligibility', href: '#eligibility' },
  { label: 'Payouts', href: '#payouts' },
  { label: 'Disputes', href: '#disputes' },
  { label: 'Chargebacks', href: '#chargebacks' },
  { label: 'Compliance', href: '#compliance' },
  { label: 'Suspension', href: '#suspension' },
  { label: 'Ranking', href: '#ranking' },
  { label: 'Your data', href: '#your-data' },
  { label: 'Changes', href: '#changes' },
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
            Your commercial agreement with Feastpot Ltd when you list and sell food on the platform,
            weekly payouts, plain rules.
          </>
        }
        footnote={<>Last updated: August 2026 &middot; England &amp; Wales</>}
      />

      <LegalQuickNav ariaLabel="Vendor terms sections" items={QUICK_NAV} />

      <LegalContentWrapper>
        {/* ── 1. Relationship ── */}
        <LegalSection id="relationship" icon="🤝" title="1. The vendor relationship">
          <p>
            By registering as a vendor on Feastpot, you enter into a commercial agreement with
            Feastpot Ltd. You are an independent business, not an employee or agent of Feastpot. You
            are solely responsible for your food, your kitchen, and your compliance with all
            applicable food law.
          </p>
          <p>
            Feastpot operates as an online intermediation service within the meaning of Regulation
            (EU) 2019/1150 as retained in UK law (the &ldquo;P2B Regulation&rdquo;). The rights and
            obligations set out in these terms are designed to comply with that regulation.
          </p>
        </LegalSection>

        {/* ── 2. Eligibility ── */}
        <LegalSection id="eligibility" icon="✅" title="2. Eligibility">
          <p>To operate as a vendor you must:</p>
          <ul style={legalListStyle}>
            <li>Be registered as a business or sole trader in the UK;</li>
            <li>
              Hold a valid Food Business Registration under the Food Safety Act 1990 (register with
              your local authority, it is free and mandatory);
            </li>
            <li>
              Have a minimum Food Hygiene Rating Scheme (FHRS) rating of 3/5 (Feastpot recommends a
              minimum of 4/5 for listing on the platform);
            </li>
            <li>Hold valid public liability insurance (minimum &pound;1&nbsp;million cover);</li>
            <li>Comply with the Food Information Regulations 2014 (allergen labelling);</li>
            <li>Comply with Natasha&rsquo;s Law (PPDS Regulation 2021);</li>
            <li>Have a valid bank account (required for Stripe Connect payouts);</li>
            <li>Provide valid photo ID during onboarding.</li>
          </ul>
        </LegalSection>

        {/* ── 3. Payouts ── */}
        <LegalSection id="payouts" icon="🏦" title="3. Payouts and commission">
          <p>
            Feastpot charges a platform commission of{' '}
            <strong>12% of the food subtotal</strong> on every completed
            marketplace order. The commission is deducted from your weekly payout&mdash;it is not
            charged to you separately and is not added to the price the customer pays.
          </p>
          <p>
            <strong>Food subtotal</strong> means the total price of food items in the order only. It
            excludes delivery fees, customer service fees, tips, and any promotional discounts
            applied by Feastpot.
          </p>
          <p>
            <strong>Example:</strong> On a &pound;100 food subtotal order you receive{' '}
            &pound;{100 - VENDOR_COMMISSION_RATE_PCT} before any delivery costs, which remain with
            you.
          </p>
          <p>
            <strong>VAT:</strong> Feastpot&rsquo;s commission is inclusive of VAT (where Feastpot is
            registered). If you are VAT-registered, you remain responsible for accounting for and
            remitting VAT on your own food sales; Feastpot does not collect or remit VAT on your
            behalf.
          </p>
          <p>
            Payouts are processed <strong>weekly, every Monday</strong>, for all orders delivered in
            the prior Monday&ndash;Sunday window. Payouts are made via Stripe Connect to your
            registered UK bank account.
          </p>
          <p>A payout will be held if:</p>
          <ul style={legalListStyle}>
            <li>A dispute or chargeback is open against your account;</li>
            <li>Your compliance documents have expired;</li>
            <li>Your account is under review.</li>
          </ul>
          <p>
            Feastpot will notify you of any hold via email and the vendor dashboard. A hold has a{' '}
            <strong>maximum review period of 14 calendar days</strong>, after which funds are either
            released or Feastpot issues a written explanation of the continued hold.
          </p>
        </LegalSection>

        {/* ── 4. Refunds and disputes ── */}
        <LegalSection id="disputes" icon="⚖️" title="4. Refunds and disputes">
          <p>
            If a customer raises a dispute, Feastpot will contact you to gather your account of
            events. You must respond within 24 hours. Failure to respond is treated as
            non-engagement and may result in a full refund to the customer at your cost.
          </p>
          <p>
            Disputes go through a two-stage internal review:
          </p>
          <ul style={legalListStyle}>
            <li>
              <strong>Stage 1 &mdash; Initial review:</strong> A Feastpot support agent reviews the
              evidence and makes an initial decision within 5 business days.
            </li>
            <li>
              <strong>Stage 2 &mdash; Senior review:</strong> If you disagree with the Stage 1
              outcome, you may appeal within{' '}
              <strong>14 calendar days</strong> of receiving it by emailing{' '}
              <LegalLink href="mailto:compliance@feastpot.co.uk">
                compliance@feastpot.co.uk
              </LegalLink>{' '}
              with the subject line &ldquo;Dispute appeal&rdquo;. A senior member of the team will
              review the appeal and respond within 5 business days.
            </li>
          </ul>
          <p>
            If a refunded amount is deducted from your payout, it will be itemised in your payout
            statement.
          </p>
        </LegalSection>

        {/* ── 5. Chargebacks and fraud ── */}
        <LegalSection id="chargebacks" icon="💳" title="5. Chargebacks and card fraud">
          <p>
            A chargeback occurs when a customer asks their card issuer to reverse a payment. When
            Feastpot receives a chargeback notification relating to one of your orders, the
            following applies:
          </p>
          <ul style={legalListStyle}>
            <li>
              <strong>Who bears the loss:</strong> If the chargeback is upheld by the card scheme
              (Visa, Mastercard), the disputed amount is deducted from your next payout. If Feastpot
              successfully disputes the chargeback on your behalf, no deduction is made.
            </li>
            <li>
              <strong>Evidence you must supply:</strong> Feastpot will contact you within 3 calendar
              days of receiving the chargeback. You must supply order confirmation, proof of delivery
              or collection, and any other relevant evidence within{' '}
              <strong>5 calendar days</strong> of Feastpot&rsquo;s request. Late or missing
              evidence significantly reduces the chance of a successful defence.
            </li>
            <li>
              <strong>Response window:</strong> Card scheme evidence deadlines are typically 20
              calendar days from the chargeback date. Feastpot will submit evidence on your behalf
              before the deadline.
            </li>
            <li>
              <strong>Appeal route:</strong> If the chargeback is lost and you believe the decision
              was incorrect, you may appeal to Feastpot within 14 calendar days of being notified.
              Email{' '}
              <LegalLink href="mailto:compliance@feastpot.co.uk">
                compliance@feastpot.co.uk
              </LegalLink>{' '}
              with the subject line &ldquo;Chargeback appeal&rdquo; and your evidence.
            </li>
          </ul>
        </LegalSection>

        {/* ── 6. Compliance ── */}
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

        {/* ── 7. Menu and pricing ── */}
        <LegalSection id="menu" icon="📋" title="7. Menu and pricing">
          <ul style={legalListStyle}>
            <li>You are responsible for keeping menu items, prices and availability accurate.</li>
            <li>You must not list items that contain undeclared allergens.</li>
            <li>Prices must be inclusive of VAT where applicable.</li>
            <li>Feastpot may remove menu items that receive repeated complaints.</li>
          </ul>
        </LegalSection>

        {/* ── 8. Order acceptance ── */}
        <LegalSection id="acceptance" icon="⏱️" title="8. Order acceptance">
          <p>
            You must accept or reject orders within 15 minutes of receipt. Failure to respond
            results in automatic order cancellation and a full refund to the customer. Repeated
            failures to accept orders may result in suspension. You must not accept orders you do
            not intend to fulfil.
          </p>
        </LegalSection>

        {/* ── 9. Prohibited conduct ── */}
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

        {/* ── 10. Suspension and removal ── */}
        <LegalSection id="suspension" icon="🛑" title="10. Suspension and removal">
          <p>Feastpot may suspend or restrict your listing if:</p>
          <ul style={legalListStyle}>
            <li>You receive 3 or more substantiated complaints in 30 days;</li>
            <li>Your FHRS rating drops below 3;</li>
            <li>You fail a compliance document check;</li>
            <li>You engage in prohibited conduct;</li>
            <li>Your Stripe Connect account is flagged by Stripe.</li>
          </ul>
          <p>
            Any suspension or restriction is accompanied by a{' '}
            <strong>written statement of reasons</strong> issued at or before the restriction takes
            effect, via email and the vendor dashboard.
          </p>
          <p>
            <strong>Full termination</strong> of your account requires at least{' '}
            <strong>30 days written notice</strong> from Feastpot, together with a written statement
            of reasons, except where immediate termination is required due to fraud, a serious food
            safety incident, or a legal obligation to act immediately. In those exceptional
            circumstances, the written statement of reasons is provided without delay.
          </p>
          <p>
            If you receive a suspension or restriction notice and disagree with it, you may appeal
            through the two-stage dispute process described in section 4.
          </p>
        </LegalSection>

        {/* ── 11. How vendors are ranked ── */}
        <LegalSection id="ranking" icon="📊" title="11. How vendors are ranked">
          <p>
            Vendors appear in Feastpot&rsquo;s search and browse results based on a combination of
            the following main parameters, listed in approximate order of relative importance:
          </p>
          <ul style={legalListStyle}>
            <li>
              <strong>Relevance</strong> &mdash; how well your menu, cuisine type, and location
              match the customer&rsquo;s search query and postcode;
            </li>
            <li>
              <strong>Fulfilment rate</strong> &mdash; the proportion of orders you accept and
              successfully deliver;
            </li>
            <li>
              <strong>Average review score</strong> &mdash; the average of all customer ratings
              received on the platform;
            </li>
            <li>
              <strong>Review volume</strong> &mdash; the total number of verified customer reviews;
            </li>
            <li>
              <strong>Compliance status</strong> &mdash; vendors with lapsed or missing compliance
              documents are ranked lower or suppressed from results;
            </li>
            <li>
              <strong>Recency of activity</strong> &mdash; newly listed or recently active vendors
              may receive a short-term visibility boost to help establish their review history.
            </li>
          </ul>
          <p>
            <strong>Paid placement:</strong> Feastpot does not currently offer paid or sponsored
            placement. If a paid placement product is introduced in the future, it will be clearly
            labelled as &ldquo;Sponsored&rdquo; and will not affect the organic ranking of other
            vendors.
          </p>
        </LegalSection>

        {/* ── 12. Your data ── */}
        <LegalSection id="your-data" icon="📂" title="12. Your data">
          <p>
            As a Feastpot vendor you can access the following data about your own business
            performance:
          </p>
          <ul style={legalListStyle}>
            <li>
              <strong>Orders</strong> &mdash; full history of all orders placed with you, including
              status, item breakdown, customer postcode (not full address), and payout amount.
            </li>
            <li>
              <strong>Payouts</strong> &mdash; weekly payout statements showing gross order value,
              commission deducted, any refund deductions, and net transfer amount.
            </li>
            <li>
              <strong>Analytics</strong> &mdash; order volume, revenue trends, and review summary,
              presented in the vendor dashboard with date-range filtering.
            </li>
            <li>
              <strong>Reviews</strong> &mdash; the text and star rating of every review left about
              your listing.
            </li>
          </ul>
          <p>
            <strong>Format and export:</strong> All data is available through the vendor portal in
            human-readable form. Payout statements can be downloaded as CSV from the Payouts page.
            To request a machine-readable export of any data Feastpot holds about your business,
            email{' '}
            <LegalLink href="mailto:compliance@feastpot.co.uk">compliance@feastpot.co.uk</LegalLink>{' '}
            with the subject line &ldquo;Data export request&rdquo;; we aim to respond within 30
            days.
          </p>
          <p>
            Customer personal data (full name, phone number, delivery address) is visible to you
            only for the purpose of fulfilling an active order and must not be stored or used for
            any other purpose.
          </p>
        </LegalSection>

        {/* ── 13. Changes to these terms ── */}
        <LegalSection id="changes" icon="📝" title="13. Changes to these terms">
          <p>
            Feastpot may update these terms from time to time. Before any change takes effect,
            Feastpot will give you a <strong>minimum of 15 days notice</strong> via:
          </p>
          <ul style={legalListStyle}>
            <li>Email to the address registered on your vendor account; and</li>
            <li>A persistent notice in the vendor dashboard.</li>
          </ul>
          <p>
            The notice will include a plain-language summary of what is changing and the date the
            change takes effect. During the notice period, you may{' '}
            <strong>terminate your agreement without penalty</strong> by notifying us at{' '}
            <LegalLink href="mailto:compliance@feastpot.co.uk">compliance@feastpot.co.uk</LegalLink>
            . If you continue to use the platform after the effective date, you are taken to have
            accepted the updated terms.
          </p>
          <p>
            A version history of these terms, including the summary of changes at each version, is
            available in the Terms &amp; Notices section of the vendor dashboard.
          </p>
        </LegalSection>

        {/* ── 14. Intellectual property ── */}
        <LegalSection id="ip" icon="📸" title="14. Intellectual property">
          <p>
            By uploading photos or content to Feastpot, you grant us a non-exclusive, royalty-free
            licence to use that content to promote the platform and your listing. You retain
            ownership of your content.
          </p>
        </LegalSection>

        {/* ── 15. Liability ── */}
        <LegalSection id="liability" icon="⚠️" title="15. Liability">
          <p>Feastpot is not liable for:</p>
          <ul style={legalListStyle}>
            <li>Food safety incidents caused by the vendor;</li>
            <li>Customer illness resulting from allergen misrepresentation;</li>
            <li>Late or failed deliveries;</li>
            <li>Loss of income due to platform downtime.</li>
          </ul>
          <p>Nothing in these terms limits liability for gross negligence or fraud.</p>
        </LegalSection>

        {/* ── 16. Governing law ── */}
        <LegalSection id="law" icon="🏛️" title="16. Governing law">
          <p>These terms are governed by the laws of England and Wales.</p>
        </LegalSection>

        <LegalContact
          number="17"
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
            <span className="text-[11px] font-medium text-white/70">
              ICO Registration: {ICO_NUMBER}
            </span>
          }
        />

        <LegalTrustStrip />
      </LegalContentWrapper>
    </LegalPageShell>
  );
}

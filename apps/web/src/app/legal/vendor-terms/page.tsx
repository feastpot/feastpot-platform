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

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { LegalLayers } from './legal-layers';
import { PrintButton } from './print-button';
import { TermsVersionBadge } from './version-badge';

export const metadata: Metadata = {
  title: 'Vendor Terms of Service',
  description:
    'Vendor Terms of Service, your commercial agreement with Feastpot Ltd when you list and sell food on the platform.',
  alternates: { canonical: '/legal/vendor-terms' },
};

const ICO_NUMBER = LEGAL.ICO_NUMBER;

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
  { label: 'Attribution', href: '#attribution' },
  { label: 'Fee changes', href: '#fee-changes' },
  { label: 'Non-exclusivity', href: '#non-exclusivity' },
  { label: 'Appeals', href: '#appeals' },
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

      {/*
       * Layer 1 + Layer 2 (P2B Regulation three-layer presentation).
       * Visible BEFORE the full legal text so vendors see the plain-language
       * summary and live rate card even if they don't scroll the full document.
       */}
      <div className="mx-auto max-w-5xl px-5 sm:px-8 lg:px-12">
        <LegalLayers />
      </div>

      <LegalContentWrapper>
        {/* Version badge + PDF download */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TermsVersionBadge />
          <PrintButton />
        </div>

        {/*
         * DRAFT NOTICE: Clauses 17-20 (Attribution, Fee-change notice,
         * Non-exclusivity, and Appeals) were added in August 2026 and are
         * pending legal review. They represent Feastpot's current operating
         * policy and are published here for transparency, but they do not
         * constitute legal advice.
         */}

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

        {/* ── 3. Payouts and commission ── */}
        <LegalSection id="payouts" icon="🏦" title="3. Payouts and commission">
          <p>
            The current Commission rates are set out in the Rate Schedule at Annex A. Feastpot may
            operate different rates by order source, and may change them only in accordance with the
            changes and fee-notice clauses below. The commission is deducted from your weekly
            payout; it is not charged to you separately and is not added to the price the customer
            pays.
          </p>
          <p>
            <strong>Food subtotal</strong> means the total price of food items in the order only. It
            excludes delivery fees, customer service fees, tips, and any promotional discounts
            applied by Feastpot.
          </p>
          <p>
            <strong>VAT:</strong> Feastpot&rsquo;s commission is inclusive of VAT (where Feastpot is
            registered). If you are VAT-registered, you remain responsible for accounting for and
            remitting VAT on your own food sales; Feastpot does not collect or remit VAT on your
            behalf.
          </p>
          <p>
            Payouts are processed <strong>weekly, every Monday</strong>, for all orders delivered in
            the prior Monday-to-Sunday window. Payouts are made via Stripe Connect to your
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
          <p>Disputes go through a two-stage internal review:</p>
          <ul style={legalListStyle}>
            <li>
              <strong>Stage 1: Initial review.</strong> A Feastpot support agent reviews the
              evidence and makes an initial decision within 5 business days.
            </li>
            <li>
              <strong>Stage 2: Senior review.</strong> If you disagree with the Stage 1 outcome, you
              may appeal within <strong>{PLATFORM_FACTS.appealWindowDays} calendar days</strong> of
              receiving it. See{' '}
              <a href="#appeals" className="underline">
                clause 20
              </a>{' '}
              for the full appeals process and contact details.
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
              days of receiving the chargeback. You must supply order confirmation, proof of
              delivery or collection, and any other relevant evidence within{' '}
              <strong>5 calendar days</strong> of Feastpot&rsquo;s request. Late or missing evidence
              significantly reduces the chance of a successful defence.
            </li>
            <li>
              <strong>Response window:</strong> Card scheme evidence deadlines are typically 20
              calendar days from the chargeback date. Feastpot will submit evidence on your behalf
              before the deadline.
            </li>
            <li>
              <strong>Appeal route:</strong> If the chargeback is lost and you believe the decision
              was incorrect, you may appeal within{' '}
              <strong>{PLATFORM_FACTS.appealWindowDays} calendar days</strong> of being notified.
              See{' '}
              <a href="#appeals" className="underline">
                clause 20
              </a>{' '}
              for the appeals process and contact details.
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
            You must accept or reject each order before your preparation window begins. For a
            scheduled order, this means accepting no later than the start of the preparation period
            implied by your stated lead time (for example, 24 hours before a Sunday lunchtime slot
            means accepting by Saturday lunchtime). In all cases you must respond within{' '}
            <strong>2 hours of the order being placed</strong>.
          </p>
          <p>
            Failure to respond before preparation must begin may result in order cancellation and a
            full refund to the customer at Feastpot&rsquo;s discretion. Repeated failures to respond
            may result in suspension. You must not accept orders you do not intend to fulfil.
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
            <strong>{PLATFORM_FACTS.terminationNoticeDays} days written notice</strong> from
            Feastpot, together with a written statement of reasons, except where immediate
            termination is required due to fraud, a serious food safety incident, or a legal
            obligation to act immediately. In those exceptional circumstances, the written statement
            of reasons is provided without delay.
          </p>
          <p>
            If you receive a suspension or restriction notice and disagree with it, you may appeal
            through the process described in{' '}
            <a href="#appeals" className="underline">
              clause 20
            </a>
            .
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
              <strong>Relevance:</strong> how well your menu, cuisine type, and location match the
              customer&rsquo;s search query and postcode;
            </li>
            <li>
              <strong>Fulfilment rate:</strong> the proportion of orders you accept and successfully
              deliver;
            </li>
            <li>
              <strong>Average review score:</strong> the average of all customer ratings received on
              the platform;
            </li>
            <li>
              <strong>Review volume:</strong> the total number of verified customer reviews;
            </li>
            <li>
              <strong>Compliance status:</strong> vendors with lapsed or missing compliance
              documents are ranked lower or suppressed from results;
            </li>
            <li>
              <strong>Recency of activity:</strong> newly listed or recently active vendors may
              receive a short-term visibility boost to help establish their review history.
            </li>
          </ul>
          <p>
            <strong>Paid placement:</strong> Feastpot does not currently offer paid or sponsored
            placement. If a paid placement product is introduced in the future, it will be clearly
            labelled as &ldquo;Sponsored&rdquo; and will not affect the organic ranking of other
            vendors.
          </p>

          {/* ── 11.1 P2B Regulation disclosure ── */}
          <h4 className="mt-4 font-semibold">11.1 P2B Regulation disclosure</h4>
          <p>
            The P2B Regulation (Regulation (EU) 2019/1150, retained in UK law) requires Feastpot to
            disclose the main parameters determining ranking and whether any payment to Feastpot
            influences them. The main parameters are those listed above in clause 11.
          </p>
          <p>
            <strong>Does payment to Feastpot affect ranking?</strong> No. Feastpot does not
            currently offer any mechanism by which a vendor can pay to improve their search
            position. Commission rates, service fees, and subscription products (if any) have no
            influence on a vendor&rsquo;s position in organic search or browse results. If this
            changes, Feastpot will update this clause and give {PLATFORM_FACTS.termsNoticeDays} days
            notice in line with clause 13.
          </p>
          <p>
            <strong>Access to data used in ranking:</strong> You can see your review score, review
            count, and order fulfilment metrics in the vendor dashboard. Feastpot does not publish
            its full ranking algorithm because doing so would allow gaming that would harm customers
            and other vendors.
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

          {/* ── 12.1 Data export right ── */}
          <h4 className="mt-4 font-semibold">12.1 Data export right</h4>
          <p>
            You own your customer relationships. You may request a machine-readable export of your
            order history and associated customer data (name, postcode, order items) at any time, at
            no charge. To request an export, email{' '}
            <LegalLink href={`mailto:${PLATFORM_FACTS.contact.complianceEmail}`}>
              {PLATFORM_FACTS.contact.complianceEmail}
            </LegalLink>{' '}
            with the subject line &ldquo;Data export request&rdquo;; Feastpot will respond within 30
            calendar days. Payout statements are available for immediate self-service download as
            CSV from the Payouts page in your vendor dashboard.
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
            Feastpot will give you a{' '}
            <strong>minimum of {PLATFORM_FACTS.termsNoticeDays} days notice</strong> via:
          </p>
          <ul style={legalListStyle}>
            <li>Email to the address registered on your vendor account; and</li>
            <li>A persistent notice in the vendor dashboard.</li>
          </ul>
          <p>
            The notice will include a plain-language summary of what is changing and the date the
            change takes effect. During the notice period, you may{' '}
            <strong>terminate your agreement without penalty</strong> by notifying us at{' '}
            <LegalLink href={`mailto:${PLATFORM_FACTS.contact.complianceEmail}`}>
              {PLATFORM_FACTS.contact.complianceEmail}
            </LegalLink>
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
          {/*
           * D4 fix (solicitor review required): clause updated from the original
           * "gross negligence or fraud" formulation, which is not a recognised
           * English-law category. Replacement uses the statutory floor mandated
           * by the Unfair Contract Terms Act 1977 and the Consumer Rights Act 2015.
           */}
          <p>
            Nothing in these terms limits or excludes our liability for: (a) death or personal
            injury caused by our negligence; (b) fraud or fraudulent misrepresentation; or (c) any
            other liability that cannot be excluded or limited by applicable law.
          </p>
        </LegalSection>

        {/* ── 16. Governing law ── */}
        <LegalSection id="law" icon="🏛️" title="16. Governing law">
          <p>These terms are governed by the laws of England and Wales.</p>
        </LegalSection>

        {/* ── 17. Attribution and commission tiers ── */}
        {/*
         * DRAFT clause pending legal review. Describes current platform
         * operating policy; not legal advice.
         */}
        <LegalSection id="attribution" icon="🔗" title="17. Attribution and commission tiers">
          <p>
            The commission rate applied to an order depends on how that order was attributed.
            Feastpot uses two cookie-based markers to determine attribution, evaluated in the
            following order of precedence.
          </p>

          <h4 className="mt-3 font-semibold">Commission tiers</h4>
          <ul style={legalListStyle}>
            <li>
              <strong>Vendor-referred:</strong> A customer who arrived via your own referral link
              within the last {PLATFORM_FACTS.attribution.vendorLinkWindowDays} days, and who has
              not been introduced to your listing through marketplace browsing during that period.
              Your unique referral link is available from the vendor dashboard.
            </li>
            <li>
              <strong>First marketplace order:</strong> The first order placed by a customer who
              discovered your listing through Feastpot search or browse.
            </li>
            <li>
              <strong>Repeat-order commission:</strong> Any subsequent order from a customer who was
              first introduced to your listing through the marketplace.
            </li>
          </ul>
          <p>The current rate for each tier appears only in the Rate Schedule at Annex A.</p>

          <h4 className="mt-3 font-semibold">
            Vendor-link marker ({PLATFORM_FACTS.attribution.vendorLinkWindowDays}-day window)
          </h4>
          <p>
            When a customer clicks your referral link, a vendor-link marker is set in their browser.
            This marker is valid for{' '}
            <strong>{PLATFORM_FACTS.attribution.vendorLinkWindowDays} days</strong>. Any order
            placed within that window, from that browser, is attributed as vendor-referred, subject
            to the marketplace override rule below.
          </p>

          <h4 className="mt-3 font-semibold">
            Marketplace-introduction override (
            {PLATFORM_FACTS.attribution.marketplaceIntroWindowDays}-day window)
          </h4>
          <p>
            When a customer browses Feastpot and views your listing through search or browse
            (regardless of whether they arrived via a referral link), a marketplace-introduction
            marker is set. This marker remains valid for{' '}
            <strong>{PLATFORM_FACTS.attribution.marketplaceIntroWindowDays} days</strong> and takes
            precedence over any vendor-link marker for the same vendor during that period.
          </p>
          <p>
            This means: if a customer first discovers your listing on Feastpot, and later clicks
            your referral link and places an order within{' '}
            {PLATFORM_FACTS.attribution.marketplaceIntroWindowDays} days of that discovery, the
            order is attributed as a marketplace order, not a vendor-referred order. The longer
            marketplace window reflects the platform&rsquo;s role in the introduction.
          </p>

          <h4 className="mt-3 font-semibold">Attribution transparency</h4>
          <p>
            The attribution source recorded for each order is shown in the payout statement for that
            order. If you believe an attribution is incorrect, contact{' '}
            <LegalLink href={`mailto:${PLATFORM_FACTS.contact.complianceEmail}`}>
              {PLATFORM_FACTS.contact.complianceEmail}
            </LegalLink>{' '}
            within {PLATFORM_FACTS.appealWindowDays} calendar days of the payout date. All rates
            quoted in this clause are sourced from the live rate schedule; see{' '}
            <a href="#fee-changes" className="underline">
              clause 18
            </a>{' '}
            for the notice commitment before any rate changes.
          </p>
        </LegalSection>

        {/* ── 18. Fee-change notice ── */}
        {/*
         * DRAFT clause pending legal review. Describes current platform
         * operating policy; not legal advice.
         */}
        <LegalSection id="fee-changes" icon="💬" title="18. Fee-change notice">
          <p>
            Feastpot commits to giving you at least{' '}
            <strong>{PLATFORM_FACTS.feeChangeNoticeDays} days written notice</strong> before raising
            any of the following rates:
          </p>
          <ul style={legalListStyle}>
            <li>The vendor-referred commission rate (clause 17);</li>
            <li>The first marketplace order commission rate (clause 17);</li>
            <li>The repeat marketplace order commission rate (clause 17);</li>
            <li>The customer service fee percentage;</li>
            <li>The customer service fee cap.</li>
          </ul>
          <p>
            Fee changes are <strong>never applied retrospectively</strong>. Any rate increase
            applies only to orders placed on or after the effective date stated in the notice.
            Orders already placed, in preparation, or paid out are not affected.
          </p>
          <p>
            <strong>What this notice commitment does not cover:</strong> This commitment covers only
            the rates that Feastpot itself sets. It does not apply to Stripe&rsquo;s card-processing
            fees, which Feastpot passes through at cost and does not control. Stripe may change its
            rates at any time in accordance with its own terms; Feastpot will inform you of any such
            changes as soon as it is made aware of them, but cannot guarantee advance notice.
          </p>
          <p>
            Notice of any fee change will be delivered via email to your registered vendor address
            and a persistent notice in the vendor dashboard, specifying the old rate, the new rate,
            and the effective date. During the notice period you may terminate your agreement
            without penalty in accordance with clause 10.
          </p>
        </LegalSection>

        {/* ── 19. Non-exclusivity ── */}
        {/*
         * DRAFT clause pending legal review. Describes current platform
         * operating policy; not legal advice.
         */}
        <LegalSection id="non-exclusivity" icon="🌐" title="19. Non-exclusivity">
          <p>
            Your agreement with Feastpot is non-exclusive. You are free to sell your food through
            any other channel, platform, or marketplace at the same time as listing on Feastpot. We
            do not require exclusivity and will not penalise you for operating on other platforms.
          </p>
          <p>
            The only restriction is that you must not use customer contact details obtained through
            Feastpot orders to solicit off-platform sales (see clause 9: Prohibited conduct).
          </p>
        </LegalSection>

        {/* ── 20. Appeals ── */}
        {/*
         * DRAFT clause pending legal review. Describes current platform
         * operating policy; not legal advice.
         */}
        <LegalSection id="appeals" icon="📣" title="20. Appeals">
          <p>
            If you disagree with a compliance decision, suspension, restriction, chargeback outcome,
            or dispute resolution, you may appeal within{' '}
            <strong>{PLATFORM_FACTS.appealWindowDays} calendar days</strong> of receiving the
            decision.
          </p>

          <h4 className="mt-3 font-semibold">How to appeal</h4>
          <ul style={legalListStyle}>
            <li>
              Email{' '}
              <LegalLink href={`mailto:${PLATFORM_FACTS.contact.appealsEmail}`}>
                {PLATFORM_FACTS.contact.appealsEmail}
              </LegalLink>{' '}
              with the subject line &ldquo;Appeal&rdquo; followed by your vendor name and the nature
              of the decision you are appealing (for example: &ldquo;Appeal &ndash; Vendor Name
              &ndash; Suspension&rdquo;).
            </li>
            <li>
              Include a clear statement of why you believe the decision was incorrect, and any
              supporting evidence.
            </li>
            <li>
              A senior member of the Feastpot team, who was not involved in the original decision,
              will review your appeal and respond within 5 business days.
            </li>
          </ul>

          <h4 className="mt-3 font-semibold">After the appeal decision</h4>
          <p>
            The outcome of the senior review is final within Feastpot&rsquo;s internal process. If
            you remain dissatisfied, you may seek resolution through the courts of England and Wales
            (clause 16) or through an appropriate alternative dispute resolution scheme.
          </p>

          <h4 className="mt-3 font-semibold">Compliance queries (not appeals)</h4>
          <p>
            For general compliance questions, document reviews, account queries, and non-appeal
            matters, contact{' '}
            <LegalLink href={`mailto:${PLATFORM_FACTS.contact.complianceEmail}`}>
              {PLATFORM_FACTS.contact.complianceEmail}
            </LegalLink>
            .
          </p>
        </LegalSection>

        <LegalContact
          number="21"
          title="Contact"
          email={PLATFORM_FACTS.contact.complianceEmail}
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

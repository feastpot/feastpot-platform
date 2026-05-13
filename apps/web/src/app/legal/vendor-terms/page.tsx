import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vendor Terms of Service',
  description:
    'Vendor Terms of Service — your commercial agreement with Feastpot Ltd when you list and sell food on the platform.',
  alternates: { canonical: '/legal/vendor-terms' },
};

export default function VendorTermsPage() {
  return (
    <article className="prose prose-slate max-w-2xl prose-headings:text-foreground prose-h1:mb-2 prose-h2:mt-10 prose-p:leading-[1.75] prose-li:leading-[1.75]">
      <h1>Vendor Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: May 2026</p>

      <h2>1. The vendor relationship</h2>
      <p>
        By registering as a vendor on Feastpot, you enter into a commercial agreement with
        Feastpot Ltd. You are an independent business, not an employee or agent of Feastpot. You
        are solely responsible for your food, your kitchen, and your compliance with all
        applicable food law.
      </p>

      <h2>2. Eligibility</h2>
      <p>To operate as a vendor you must:</p>
      <ul>
        <li>Be registered as a business or sole trader in the UK;</li>
        <li>
          Hold a valid Food Business Registration under the Food Safety Act 1990 (register with
          your local authority — it is free and mandatory);
        </li>
        <li>
          Have a minimum Food Hygiene Rating Scheme (FHRS) rating of 3/5 (Feastpot recommends a
          minimum of 4/5 for listing on the platform);
        </li>
        <li>Hold valid public liability insurance (minimum £1&nbsp;million cover);</li>
        <li>Comply with the Food Information Regulations 2014 (allergen labelling);</li>
        <li>Comply with Natasha&rsquo;s Law (PPDS Regulation 2021);</li>
        <li>Have a valid bank account (required for Stripe Connect payouts);</li>
        <li>Provide valid photo ID during onboarding.</li>
      </ul>

      <h2>3. Platform commission</h2>
      <p>
        Feastpot charges a commission of <strong>12% of the order subtotal</strong> (excluding
        delivery fees) on each completed order. This commission is deducted from your weekly
        payout — it is not charged separately.
      </p>
      <p>
        Feastpot reserves the right to adjust the commission rate with 30 days&rsquo; written
        notice to active vendors.
      </p>

      <h2>4. Payouts</h2>
      <p>
        Payouts are processed <strong>weekly, every Monday</strong>, for all orders delivered in
        the prior Monday–Sunday window. Payouts are made via Stripe Connect to your registered UK
        bank account.
      </p>
      <p>A payout will be held if:</p>
      <ul>
        <li>A dispute is open against your account;</li>
        <li>Your compliance documents have expired;</li>
        <li>Your account is under review.</li>
      </ul>
      <p>Feastpot will notify you of any hold via email and the vendor dashboard.</p>

      <h2>5. Refunds and disputes</h2>
      <p>
        If a customer dispute results in a full or partial refund, the refunded amount (plus any
        applicable commission) will be deducted from your next payout. Vendors are expected to
        respond to dispute enquiries within 24 hours. Failure to respond will be treated as
        non-engagement and may result in a full refund to the customer at the vendor&rsquo;s cost.
        Feastpot&rsquo;s decision on disputes is final.
      </p>

      <h2>6. Food safety and compliance</h2>
      <p>You are solely responsible for:</p>
      <ul>
        <li>The safety and quality of all food prepared and delivered;</li>
        <li>
          Correct allergen declaration for every menu item (Food Information Regulations 2014);
        </li>
        <li>Compliance with Natasha&rsquo;s Law for pre-packaged food;</li>
        <li>Maintaining your FHRS rating;</li>
        <li>Keeping your compliance documents current (hygiene certificate, insurance, FHRS).</li>
      </ul>
      <p>
        Feastpot may suspend your listing if compliance documents expire and are not renewed
        within 7 days of the first reminder.
      </p>

      <h2>7. Menu and pricing</h2>
      <ul>
        <li>You are responsible for keeping menu items, prices and availability accurate.</li>
        <li>You must not list items that contain undeclared allergens.</li>
        <li>Prices must be inclusive of VAT where applicable.</li>
        <li>Feastpot may remove menu items that receive repeated complaints.</li>
      </ul>

      <h2>8. Order acceptance</h2>
      <p>
        You must accept or reject orders within 15 minutes of receipt. Failure to respond results
        in automatic order cancellation and a full refund to the customer. Repeated failures to
        accept orders may result in suspension. You must not accept orders you do not intend to
        fulfil.
      </p>

      <h2>9. Prohibited conduct</h2>
      <p>You must not:</p>
      <ul>
        <li>Solicit customers to order off-platform;</li>
        <li>Misrepresent allergen information;</li>
        <li>List food you are not licensed or registered to sell;</li>
        <li>Request or accept cash payments for platform orders;</li>
        <li>Threaten, harass or intimidate customers.</li>
      </ul>

      <h2>10. Suspension and removal</h2>
      <p>Feastpot may suspend or remove your listing immediately if:</p>
      <ul>
        <li>You receive 3 or more substantiated complaints in 30 days;</li>
        <li>Your FHRS rating drops below 3;</li>
        <li>You fail a compliance document check;</li>
        <li>You engage in prohibited conduct;</li>
        <li>Your Stripe Connect account is flagged by Stripe.</li>
      </ul>
      <p>
        We will notify you of any suspension and the reason for it. Appeals must be submitted to{' '}
        <a href="mailto:compliance@feastpot.co.uk">compliance@feastpot.co.uk</a> within 7 days.
      </p>

      <h2>11. Intellectual property</h2>
      <p>
        By uploading photos or content to Feastpot, you grant us a non-exclusive, royalty-free
        licence to use that content to promote the platform and your listing. You retain ownership
        of your content.
      </p>

      <h2>12. Liability</h2>
      <p>Feastpot is not liable for:</p>
      <ul>
        <li>Food safety incidents caused by the vendor;</li>
        <li>Customer illness resulting from allergen misrepresentation;</li>
        <li>Late or failed deliveries;</li>
        <li>Loss of income due to platform downtime.</li>
      </ul>
      <p>Nothing in these terms limits liability for gross negligence or fraud.</p>

      <h2>13. Governing law</h2>
      <p>These terms are governed by the laws of England and Wales.</p>
    </article>
  );
}

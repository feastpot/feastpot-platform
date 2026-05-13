import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Feastpot collects, uses and protects your personal data under the UK GDPR, the Data Protection Act 2018, and the Data (Use and Access) Act 2025.',
  alternates: { canonical: '/legal/privacy' },
};

const ICO_NUMBER = 'C1931679';

export default function PrivacyPage() {
  return (
    <article className="prose prose-slate max-w-2xl prose-headings:text-foreground prose-h1:mb-2 prose-h2:mt-10 prose-h3:mt-6 prose-p:leading-[1.75] prose-li:leading-[1.75] prose-table:text-sm">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: May 2026</p>

      <div className="not-prose my-6 inline-flex flex-col rounded-lg bg-teal/10 px-4 py-3 text-sm">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          ICO Registration Reference
        </span>
        <span className="mt-0.5 font-mono text-base font-semibold text-foreground">
          {ICO_NUMBER}
        </span>
      </div>

      <h2>1. Who we are</h2>
      <p>
        Feastpot is operated by Feastpot Ltd, a UK company. We are registered with the Information
        Commissioner&rsquo;s Office (ICO) as a data controller.
      </p>
      <p>
        ICO Registration Reference: <strong>{ICO_NUMBER}</strong>
        <br />
        Contact: <a href="mailto:privacy@feastpot.co.uk">privacy@feastpot.co.uk</a>
      </p>
      <p>
        We process personal data in accordance with the UK General Data Protection Regulation
        (UK&nbsp;GDPR), the Data Protection Act 2018, and the Data (Use and Access) Act 2025 (in
        force from 19 June 2025).
      </p>

      <h2>2. What data we collect</h2>
      <h3>A. Account data</h3>
      <p>
        Full name, email address, phone number, password (hashed — never stored in plaintext),
        and an optional profile photo.
      </p>
      <h3>B. Delivery data</h3>
      <p>Delivery addresses, postcodes, and geocoded coordinates.</p>
      <h3>C. Order data</h3>
      <p>
        Order history, basket contents, delivery slot selections, order notes, and reorder history.
      </p>
      <h3>D. Payment data</h3>
      <p>
        Stripe payment reference IDs, last 4 digits of your card (held by Stripe, not by Feastpot),
        and payout bank details for vendors (held by Stripe Connect).
      </p>
      <h3>E. Vendor data</h3>
      <p>
        Business name, business address, FSA registration number, hygiene certificate, insurance
        certificate, photo ID, and bank account details (held by Stripe).
      </p>
      <h3>F. Communications</h3>
      <p>
        Email and WhatsApp message history, support ticket content, and dispute evidence (photos,
        documents).
      </p>
      <h3>G. Technical data</h3>
      <p>
        IP address, device type, browser type, session tokens, and push notification subscription
        tokens.
      </p>
      <h3>H. Usage data</h3>
      <p>
        Pages visited, search queries, filter selections and click patterns. Used only for platform
        improvement — never sold or shared with advertisers.
      </p>

      <h2>3. Why we process your data (lawful bases)</h2>

      <h3>Account creation and authentication</h3>
      <p>
        <strong>Basis:</strong> Contract performance (Article 6(1)(b) UK&nbsp;GDPR).
        <br />
        <strong>Retention:</strong> Until account deletion or 24 months of inactivity, then purged.
      </p>

      <h3>Order placement and fulfilment</h3>
      <p>
        <strong>Basis:</strong> Contract performance (Article 6(1)(b)).
        <br />
        <strong>Retention:</strong> 6 years (VAT and tax record obligation under HMRC rules).
      </p>

      <h3>Payment processing via Stripe</h3>
      <p>
        <strong>Basis:</strong> Contract performance (Article 6(1)(b)).
        <br />
        Feastpot does not store card numbers. Stripe is our payment processor and acts as a data
        processor under our Data Processing Agreement with them.
      </p>

      <h3>Vendor identity verification and compliance documents</h3>
      <p>
        <strong>Basis:</strong> Legal obligation (Article 6(1)(c)) — Food Safety Act 1990, Food
        Information Regulations 2014, and Natasha&rsquo;s Law (PPDS Regulation 2021).
        <br />
        <strong>Retention:</strong> Duration of vendor relationship + 6 years.
      </p>

      <h3>Sending transactional notifications (order updates, delivery status)</h3>
      <p>
        <strong>Basis:</strong> Contract performance (Article 6(1)(b)) and legitimate interests
        (Article 6(1)(f)) — the legitimate interest is ensuring customers and vendors receive
        essential operational communications.
      </p>

      <h3>Marketing communications (if opted in)</h3>
      <p>
        <strong>Basis:</strong> Consent (Article 6(1)(a)).
        <br />
        <strong>Retention:</strong> Until consent is withdrawn + 12 months for consent records.
      </p>

      <h3>Fraud prevention, security, and abuse detection</h3>
      <p>
        <strong>Basis:</strong> Legitimate interests (Article 6(1)(f)) — recognised under the Data
        (Use and Access) Act 2025 Schedule 1 legitimate interests list.
        <br />
        <strong>Retention:</strong> 6 years (audit log retention).
      </p>

      <h3>Dispute resolution and audit log maintenance</h3>
      <p>
        <strong>Basis:</strong> Legal obligation (Article 6(1)(c)) and legitimate interests.
        <br />
        <strong>Retention:</strong> 6 years.
      </p>

      <h3>Analytics and platform improvement (anonymised / aggregated)</h3>
      <p>
        <strong>Basis:</strong> Legitimate interests (Article 6(1)(f)).
        <br />
        Individual user data is never sold to third parties or shared with advertisers. We do not
        use advertising cookies.
      </p>

      <h2>4. Who we share your data with</h2>
      <ul>
        <li>
          <strong>Stripe Inc</strong> (USA) — payment processing and vendor payouts. Protected by
          the UK International Data Transfer Agreement (UK&nbsp;IDTA) and Stripe&rsquo;s SCCs.
        </li>
        <li>
          <strong>Supabase Inc</strong> (USA, EU infrastructure) — database and authentication
          hosting. Feastpot data is stored in the EU (Frankfurt region). Protected by the
          UK&nbsp;IDTA.
        </li>
        <li>
          <strong>Resend Inc</strong> (USA) — transactional email delivery. Protected by the
          UK&nbsp;IDTA.
        </li>
        <li>
          <strong>Twilio Inc</strong> (USA) — SMS and OTP delivery. Protected by the UK&nbsp;IDTA.
        </li>
        <li>
          <strong>Meta Platforms Ireland Ltd</strong> (Ireland / USA) — WhatsApp Business API for
          order notifications. Protected by the EU-UK adequacy decision and SCCs.
        </li>
        <li>
          <strong>Cloudflare Inc</strong> (USA) — CDN, security and media storage. Protected by the
          UK&nbsp;IDTA.
        </li>
        <li>
          <strong>Sentry Inc</strong> (USA) — error monitoring (anonymised stack traces only; no
          personal data in error reports by design). Protected by the UK&nbsp;IDTA.
        </li>
        <li>
          <strong>HMRC (UK)</strong> — tax records as legally required.
        </li>
        <li>
          <strong>Law enforcement / courts</strong> — when legally compelled by a valid court order
          or statutory authority.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> sell personal data. We do <strong>not</strong> share personal
        data with advertisers, data brokers, or marketing companies.
      </p>

      <h2>5. International transfers</h2>
      <p>
        Some of our service providers are based outside the UK. Where this is the case, we ensure
        transfers are protected by one of the following safeguards:
      </p>
      <ul>
        <li>UK International Data Transfer Agreement (UK&nbsp;IDTA);</li>
        <li>EU Standard Contractual Clauses (SCCs) under the EU-UK adequacy decision;</li>
        <li>Adequacy regulations made under section 17A of the Data Protection Act 2018.</li>
      </ul>
      <p>Transfers to the EU/EEA are covered by the UK&rsquo;s adequacy decision for the EEA.</p>

      <h2>6. How long we keep your data</h2>
      <div className="not-prose my-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="border border-border p-2 font-semibold">Data type</th>
              <th className="border border-border p-2 font-semibold">Retention period</th>
              <th className="border border-border p-2 font-semibold">Reason</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-border p-2">Orders and payments</td>
              <td className="border border-border p-2">6 years from order date</td>
              <td className="border border-border p-2">HMRC / VAT obligation</td>
            </tr>
            <tr>
              <td className="border border-border p-2">Audit logs</td>
              <td className="border border-border p-2">6 years</td>
              <td className="border border-border p-2">Legal obligation</td>
            </tr>
            <tr>
              <td className="border border-border p-2">Account data</td>
              <td className="border border-border p-2">
                Until deletion request or 24 months inactivity
              </td>
              <td className="border border-border p-2">Contract</td>
            </tr>
            <tr>
              <td className="border border-border p-2">Marketing consent</td>
              <td className="border border-border p-2">Until withdrawn + 12 months</td>
              <td className="border border-border p-2">Accountability</td>
            </tr>
            <tr>
              <td className="border border-border p-2">Vendor documents</td>
              <td className="border border-border p-2">Duration of relationship + 6 years</td>
              <td className="border border-border p-2">Food safety law</td>
            </tr>
            <tr>
              <td className="border border-border p-2">Support communications</td>
              <td className="border border-border p-2">2 years from resolution</td>
              <td className="border border-border p-2">Legitimate interest</td>
            </tr>
            <tr>
              <td className="border border-border p-2">Technical / session data</td>
              <td className="border border-border p-2">90 days</td>
              <td className="border border-border p-2">Security</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>7. Your rights under UK GDPR</h2>
      <ol>
        <li>
          <strong>Right of access</strong> (Subject Access Request) — email{' '}
          <a href="mailto:privacy@feastpot.co.uk">privacy@feastpot.co.uk</a>.
        </li>
        <li>
          <strong>Right to rectification</strong> — update in account settings or email us.
        </li>
        <li>
          <strong>Right to erasure</strong> (&ldquo;right to be forgotten&rdquo;) — subject to
          legal retention obligations.
        </li>
        <li>
          <strong>Right to restriction of processing.</strong>
        </li>
        <li>
          <strong>Right to data portability</strong> — machine-readable format on request.
        </li>
        <li>
          <strong>Right to object</strong> — including to direct marketing (always honoured).
        </li>
        <li>
          <strong>Right not to be subject to automated decision-making.</strong>
        </li>
        <li>
          <strong>Right to withdraw consent</strong> at any time (does not affect prior lawful
          processing).
        </li>
      </ol>
      <p>
        Some rights are subject to exemptions under the Data Protection Act 2018 and the Data (Use
        and Access) Act 2025, particularly where processing is required for legal compliance, fraud
        prevention, or public interest.
      </p>
      <p>
        To exercise any right, email{' '}
        <a href="mailto:privacy@feastpot.co.uk">privacy@feastpot.co.uk</a> with &ldquo;Data Rights
        Request&rdquo; in the subject line. We will respond within one calendar month (extendable
        by two further months for complex requests — we will notify you).
      </p>
      <p>
        You also have the right to lodge a complaint with the ICO:{' '}
        <a href="https://ico.org.uk/make-a-complaint" target="_blank" rel="noreferrer">
          ico.org.uk/make-a-complaint
        </a>{' '}
        &middot; 0303 123 1113.
      </p>

      <h2>8. Cookies</h2>
      <p>Feastpot uses strictly necessary cookies only:</p>
      <ul>
        <li>Authentication session cookie (Supabase JWT — expires in 1 hour, refreshed);</li>
        <li>CSRF protection token;</li>
        <li>Basket persistence (localStorage, not a cookie — client-side only).</li>
      </ul>
      <p>
        Under the Privacy and Electronic Communications Regulations (PECR), strictly necessary
        cookies do not require prior consent. We do not use advertising cookies, tracking pixels,
        or third-party analytics cookies. Our cookie banner is informational only for this reason.
      </p>

      <h2>9. Changes to this policy</h2>
      <p>
        We will notify registered users by email of material changes at least 14 days before they
        take effect. Minor changes (grammar, clarifications) take effect immediately. The
        &ldquo;last updated&rdquo; date at the top of this page will always reflect the most
        recent version.
      </p>

      <h2>10. Contact</h2>
      <p>
        <a href="mailto:privacy@feastpot.co.uk">privacy@feastpot.co.uk</a>
        <br />
        Subject line: &ldquo;Privacy enquiry&rdquo;.
        <br />
        We aim to respond within 5 business days.
      </p>
    </article>
  );
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Feastpot collects, uses and protects your personal data under UK GDPR.',
  alternates: { canonical: '/legal/privacy' },
};

export default function PrivacyPage() {
  // Read at render time on the server. Defaults to "Registration pending" so
  // the page is always safe to ship — the ICO number is dropped in via env
  // var (NEXT_PUBLIC_ICO_NUMBER) once the registration comes back from the
  // ICO without needing a code change or redeploy.
  const icoNumber = process.env.NEXT_PUBLIC_ICO_NUMBER ?? 'Registration pending';
  const icoPending = !process.env.NEXT_PUBLIC_ICO_NUMBER;

  return (
    <article className="prose prose-slate mx-auto w-full max-w-3xl px-4 py-10 md:py-14">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: May 2026</p>

      {icoPending && (
        <div className="not-prose mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          ICO registration is in progress. This page will be updated within 5 business days of confirmation.
        </div>
      )}

      <h2>1. Who we are</h2>
      <p>
        Feastpot Ltd is the data controller for personal data processed through this platform. We are
        registered with the UK Information Commissioner&rsquo;s Office.
      </p>
      <p>
        ICO Registration Number: <strong>{icoNumber}</strong>
      </p>
      <p>
        Contact our data team: <a href="mailto:privacy@feastpot.co.uk">privacy@feastpot.co.uk</a>.
      </p>

      <h2>2. What data we collect</h2>
      <ul>
        <li><strong>Account:</strong> name, email, phone number, account password (hashed), user role.</li>
        <li><strong>Delivery:</strong> delivery addresses, postcodes, delivery instructions.</li>
        <li><strong>Orders:</strong> order history, order notes, dispute evidence you upload.</li>
        <li><strong>Payments:</strong> Stripe customer reference and last 4 digits of card. We do <em>not</em> store
          full card numbers — these stay with Stripe.</li>
        <li><strong>Communications:</strong> messages you send to vendors or support, push/SMS/WhatsApp opt-in
          state.</li>
        <li><strong>Technical:</strong> IP address, device/browser, cookies for session and CSRF.</li>
      </ul>

      <h2>3. How we use it (legal bases)</h2>
      <ul>
        <li><strong>Contract performance</strong> — taking and fulfilling orders, processing refunds, customer
          support.</li>
        <li><strong>Legitimate interests</strong> — fraud prevention, platform analytics in aggregate, improving
          the service. You can object at any time.</li>
        <li><strong>Legal obligation</strong> — VAT/tax records, food-safety incident records, complying with
          ICO/HMRC requests.</li>
        <li><strong>Consent</strong> — marketing emails, push notifications, WhatsApp messages. You can
          withdraw consent at any time from your account settings.</li>
      </ul>

      <h2>4. Sharing</h2>
      <p>We share the minimum data needed:</p>
      <ul>
        <li><strong>Vendors</strong> — name, delivery address, order details, contact phone for the active order.</li>
        <li><strong>Stripe</strong> (payments processor — US, with adequate transfer mechanisms in place).</li>
        <li><strong>Supabase</strong> (database hosting — EU, no third-country transfer).</li>
        <li><strong>Twilio / Resend</strong> (SMS / email delivery providers — US, with SCCs).</li>
        <li>Authorities, where legally compelled.</li>
      </ul>
      <p>We never sell your data and we do not run advertising cookies.</p>

      <h2>5. International transfers</h2>
      <p>
        Where a processor (e.g. Stripe, Twilio, Resend) is based outside the UK/EEA, transfers are protected by
        the UK International Data Transfer Agreement (IDTA) or the EU Standard Contractual Clauses (SCCs) plus
        supplementary measures.
      </p>

      <h2>6. Retention</h2>
      <ul>
        <li><strong>Order &amp; tax records</strong> — 6 years from order date (HMRC requirement).</li>
        <li><strong>Account data</strong> — until you request deletion, or 24 months of inactivity.</li>
        <li><strong>Audit logs</strong> — 6 years for fraud investigation and regulatory compliance.</li>
        <li><strong>Marketing consent records</strong> — until withdrawn, plus 12 months for evidence.</li>
      </ul>

      <h2>7. Your rights under UK GDPR</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you.</li>
        <li>Rectify inaccurate data.</li>
        <li>Erase your data (subject to our legal retention obligations above).</li>
        <li>Receive your data in a portable format.</li>
        <li>Object to processing based on legitimate interests.</li>
        <li>Withdraw consent for marketing at any time.</li>
        <li>Lodge a complaint with the{' '}
          <a href="https://ico.org.uk" target="_blank" rel="noreferrer">
            Information Commissioner&rsquo;s Office
          </a>{' '}
          if you believe we have mishandled your data.
        </li>
      </ul>
      <p>To exercise any right, email <a href="mailto:privacy@feastpot.co.uk">privacy@feastpot.co.uk</a>. We
        respond within one calendar month.</p>

      <h2>8. Cookies</h2>
      <p>
        We only use strictly-necessary cookies — session, CSRF and basket state. Under PECR these do not
        require prior opt-in, but we display a clear notice on first visit. We do not use advertising or
        cross-site tracking cookies.
      </p>

      <h2>9. Changes</h2>
      <p>We&rsquo;ll update this page when our practices change and notify you by email if the changes are
        material.</p>
    </article>
  );
}

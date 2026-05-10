import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Feastpot Terms of Service for customers and vendors using the platform.',
  alternates: { canonical: '/legal/terms' },
};

export default function TermsPage() {
  return (
    <article className="prose prose-slate mx-auto w-full max-w-3xl px-4 py-10 md:py-14">
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: May 2026</p>

      <h2>1. About Feastpot</h2>
      <p>
        Feastpot Ltd (&ldquo;Feastpot&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates an online marketplace
        connecting independent food vendors with customers in the United Kingdom. Feastpot itself is a
        technology platform — we do <strong>not</strong> prepare, store, cook or serve food. Each order is
        between you (the customer) and the vendor you select.
      </p>

      <h2>2. Eligibility &amp; account</h2>
      <p>You must be at least 18 years old to place an order. You agree to keep your account credentials
        confidential and to notify us immediately at <a href="mailto:support@feastpot.co.uk">support@feastpot.co.uk</a>
        if you suspect unauthorised access.</p>

      <h2>3. Vendor obligations</h2>
      <ul>
        <li>Comply with all applicable food hygiene, allergen labelling and food safety legislation, including the
          Food Safety Act 1990, Food Information Regulations 2014 (FIR), and Natasha&rsquo;s Law where applicable.</li>
        <li>Maintain a valid Food Hygiene Rating Scheme (FHRS) registration and provide evidence on request.</li>
        <li>Declare the 14 major allergens on every menu item. Allergen information must be accurate and up to date.</li>
        <li>Fulfil orders within the lead time committed at checkout, and notify customers promptly of any delay.</li>
        <li>Respond to disputes within 24 hours and provide reasonable evidence on request.</li>
      </ul>

      <h2>4. Customer rights &amp; refund policy</h2>
      <p>
        If your order is not delivered, is materially different from what was ordered, or is unsafe to consume,
        you can raise a dispute from the order page within 24 hours of the delivery time. Our support team will
        review evidence (photos, vendor messages, delivery records) and resolve the dispute within 24 hours.
        Approved refunds are processed back to your original payment method within 5 business days.
      </p>
      <p>
        This sits alongside your statutory rights under the Consumer Rights Act 2015. Nothing in these terms
        excludes or limits liability that cannot be excluded under English law (including death or personal
        injury caused by negligence, or fraud).
      </p>

      <h2>5. Pricing, payments &amp; commission</h2>
      <ul>
        <li>All prices are shown in pounds sterling and include VAT where applicable.</li>
        <li>Payments are processed by Stripe. Feastpot does not store full payment card details.</li>
        <li>Feastpot charges vendors a <strong>12% commission</strong> on the order subtotal (excluding delivery
          fees and tips). Commission is deducted automatically at payout time.</li>
        <li>Vendor payouts run weekly: completed-order earnings are settled every <strong>Monday</strong> by Stripe
          Connect. Held payouts (e.g. pending compliance review) are released once cleared.</li>
      </ul>

      <h2>6. Prohibited content &amp; conduct</h2>
      <p>You must not use Feastpot to:</p>
      <ul>
        <li>List, sell, or order alcohol without a valid premises licence under the Licensing Act 2003.</li>
        <li>Misrepresent ingredients, allergens, hygiene ratings or business identity.</li>
        <li>Harass, threaten or abuse other users, vendors, or our staff.</li>
        <li>Attempt to circumvent platform fees by directing orders off-platform after first contact via Feastpot.</li>
      </ul>

      <h2>7. Intellectual property</h2>
      <p>
        The Feastpot brand, logos, and platform code are owned by Feastpot Ltd. Vendor-uploaded content
        (photos, descriptions) remains owned by the vendor; by uploading, vendors grant us a worldwide,
        royalty-free licence to display that content on the platform.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Feastpot&rsquo;s total liability arising from or in connection with
        these terms is capped at the value of the orders you have placed in the 12 months preceding the
        relevant event. We are not liable for indirect or consequential losses.
      </p>

      <h2>9. Suspension &amp; termination</h2>
      <p>We may suspend or terminate accounts that breach these terms, present safety risks, or are subject to
        ongoing fraud or chargeback investigations. Vendors may close their account at any time after
        fulfilling outstanding orders.</p>

      <h2>10. Governing law</h2>
      <p>These terms are governed by the laws of <strong>England and Wales</strong>. Disputes are subject to the
        exclusive jurisdiction of the English courts.</p>

      <h2>11. Contact</h2>
      <p>
        Questions about these terms? Email <a href="mailto:legal@feastpot.co.uk">legal@feastpot.co.uk</a>.
      </p>
    </article>
  );
}

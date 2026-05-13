import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description:
    'Feastpot uses strictly necessary cookies only — no advertising, no tracking, no third-party analytics.',
  alternates: { canonical: '/legal/cookies' },
};

export default function CookiesPage() {
  return (
    <article className="prose prose-slate max-w-2xl prose-headings:text-foreground prose-h1:mb-2 prose-h2:mt-10 prose-p:leading-[1.75] prose-li:leading-[1.75]">
      <h1>Cookie Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: May 2026</p>

      <h2>1. What are cookies?</h2>
      <p>
        Cookies are small text files that a website stores on your device to remember things like
        whether you&rsquo;re signed in. Some sites also use them to track you across the web —
        Feastpot does not.
      </p>

      <h2>2. Cookies we use</h2>
      <p>Feastpot uses strictly necessary storage only:</p>
      <div className="not-prose my-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="border border-border p-2 font-semibold">Name</th>
              <th className="border border-border p-2 font-semibold">Purpose</th>
              <th className="border border-border p-2 font-semibold">Duration</th>
              <th className="border border-border p-2 font-semibold">Strictly necessary</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-border p-2 font-mono text-xs">sb-access-token</td>
              <td className="border border-border p-2">Supabase authentication JWT</td>
              <td className="border border-border p-2">1 hour</td>
              <td className="border border-border p-2">Yes</td>
            </tr>
            <tr>
              <td className="border border-border p-2 font-mono text-xs">sb-refresh-token</td>
              <td className="border border-border p-2">Supabase session refresh</td>
              <td className="border border-border p-2">30 days</td>
              <td className="border border-border p-2">Yes</td>
            </tr>
            <tr>
              <td className="border border-border p-2 font-mono text-xs">feastpot.basket.v1</td>
              <td className="border border-border p-2">
                Basket persistence (localStorage)
              </td>
              <td className="border border-border p-2">Session</td>
              <td className="border border-border p-2">Yes (not a cookie)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>3. Cookies we do not use</h2>
      <p>
        We do <strong>not</strong> use advertising cookies, tracking pixels, third-party analytics
        cookies, Google Analytics, the Facebook Pixel, or anything similar. None. Ever.
      </p>

      <h2>4. Your choices</h2>
      <p>
        You can clear cookies via your browser settings — this will sign you out. Because we don&rsquo;t
        use any non-essential cookies, there is nothing to opt out of.
      </p>

      <h2>5. Contact</h2>
      <p>
        Questions? Email <a href="mailto:privacy@feastpot.co.uk">privacy@feastpot.co.uk</a>.
      </p>
    </article>
  );
}

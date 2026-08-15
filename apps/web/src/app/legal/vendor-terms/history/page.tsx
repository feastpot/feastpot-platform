import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Vendor Terms Version History',
  description:
    'A record of all published versions of the Feastpot Vendor Terms, with effective dates and change summaries.',
  alternates: { canonical: '/legal/vendor-terms/history' },
};

interface TermsVersionRow {
  id: string;
  version: string;
  changeSummary: string | null;
  isMaterial: boolean;
  publishedAt: string;
  effectiveAt: string;
  supersededAt: string | null;
  contentHash: string;
}

async function fetchVersionHistory(): Promise<TermsVersionRow[]> {
  try {
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';
    const res = await fetch(`${apiBase}/v1/terms/versions?documentType=VENDOR_TERMS`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json() as Promise<TermsVersionRow[]>;
  } catch {
    return [];
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function VendorTermsHistoryPage() {
  const versions = await fetchVersionHistory();

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/legal/vendor-terms"
          className="text-sm text-brand underline hover:no-underline"
        >
          Back to Vendor Terms
        </Link>
      </div>

      <h1 className="mb-1 text-2xl font-bold text-charcoal">Vendor Terms Version History</h1>
      <p className="mb-8 text-charcoal-mid">
        All published versions of the Feastpot Vendor Terms, newest first. The version currently in
        force is marked as Live. Superseded versions remain available for reference.
      </p>

      {versions.length === 0 ? (
        <p className="text-charcoal-mid">No published versions on record yet.</p>
      ) : (
        <ol className="space-y-6">
          {versions.map((v) => {
            const isLive = !v.supersededAt && new Date(v.effectiveAt) <= new Date();
            const isPending = new Date(v.effectiveAt) > new Date();
            return (
              <li
                key={v.id}
                className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-charcoal">Version {v.version}</span>
                  {isLive && (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                      Live
                    </span>
                  )}
                  {isPending && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      Pending
                    </span>
                  )}
                  {v.supersededAt && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                      Superseded
                    </span>
                  )}
                  {v.isMaterial && (
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                      Material change
                    </span>
                  )}
                </div>

                <dl className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
                  <div>
                    <dt className="text-xs text-charcoal-mid">Published</dt>
                    <dd className="font-medium text-charcoal">{formatDate(v.publishedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-charcoal-mid">Effective</dt>
                    <dd className="font-medium text-charcoal">{formatDate(v.effectiveAt)}</dd>
                  </div>
                  {v.supersededAt && (
                    <div>
                      <dt className="text-xs text-charcoal-mid">Superseded</dt>
                      <dd className="font-medium text-charcoal">{formatDate(v.supersededAt)}</dd>
                    </div>
                  )}
                </dl>

                {v.changeSummary && (
                  <p className="mb-3 text-sm text-charcoal-mid">{v.changeSummary}</p>
                )}

                <p className="font-mono text-[10px] text-charcoal-light">
                  SHA-256: {v.contentHash}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-10 rounded-2xl border border-cream-deep bg-cream p-5 text-sm text-charcoal-mid">
        <p className="font-semibold text-charcoal">About this record</p>
        <p className="mt-1">
          Each version&apos;s content hash (SHA-256) is computed at publication time and is
          immutable. It can be used to independently verify that the document you accepted matches
          the published text.
        </p>
        <p className="mt-2">
          Questions? Email{' '}
          <a href="mailto:compliance@feastpot.co.uk" className="text-brand underline">
            compliance@feastpot.co.uk
          </a>
          .
        </p>
      </div>
    </div>
  );
}

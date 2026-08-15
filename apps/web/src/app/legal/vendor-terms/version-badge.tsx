/**
 * Server component that fetches the current live vendor terms version from the
 * API and renders a small version + effective-date badge at the top of the page.
 * Falls back gracefully when no version is published yet.
 */
export const dynamic = 'force-dynamic';

interface TermsVersionMeta {
  version: string;
  effectiveAt: string;
  contentHash: string;
}

async function fetchCurrentVersion(): Promise<TermsVersionMeta | null> {
  try {
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';
    const res = await fetch(`${apiBase}/v1/terms/current?documentType=VENDOR_TERMS`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as TermsVersionMeta;
  } catch {
    return null;
  }
}

export async function TermsVersionBadge() {
  const meta = await fetchCurrentVersion();
  if (!meta) return null;

  const effectiveDate = new Date(meta.effectiveAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium">
        Version {meta.version}
      </span>
      <span>Effective {effectiveDate}</span>
      <a href="/legal/vendor-terms/history" className="underline hover:text-foreground">
        Version history
      </a>
    </div>
  );
}

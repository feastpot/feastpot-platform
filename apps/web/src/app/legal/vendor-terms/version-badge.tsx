export interface TermsVersionMeta {
  version: string;
  effectiveAt: string;
  contentHash: string;
}

/** Metadata supplied by the parent, not a second cached API request. */
export function TermsVersionBadge({ version: meta }: { version: TermsVersionMeta }) {
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

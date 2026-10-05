import type { RateRow } from '@feastpot/ui';

export interface CanonicalVendorTerms {
  id: string;
  version: string;
  effectiveAt: string;
  contentHash: string;
  contentMdx: string;
}

export function documentSections(content: string): { title: string; content: string }[] {
  return content
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const end = section.indexOf('\n');
      return { title: section.slice(0, end), content: section.slice(end + 1).trim() };
    });
}

export function canonicalAnnexARates(content: string): RateRow[] {
  const annex = documentSections(content).find((s) => /^Annex A\b/i.test(s.title));
  if (!annex) throw new Error('The current Vendor Terms have no Annex A.');
  const keys: Record<string, string> = {
    'Marketplace, first order with a vendor': 'standard_commission',
    'Marketplace, repeat order with the same vendor': 'repeat_commission',
    'Vendor-referred food orders': 'referred_commission',
    'Catering, Feastpot-sourced client': 'catering_commission',
    'Catering, client brought by the vendor': 'catering_vendor_referred_commission',
    'Customer service fee': 'customer_service_fee',
    'New vendor': 'standard_commission',
    'Established vendor': 'repeat_commission',
    'Referred vendor': 'referred_commission',
  };
  return annex.content
    .split('\n')
    .filter((line) => /^\|/.test(line))
    .slice(2)
    .map((line, index) => {
      const [label, rateDisplay, basis, status] = line
        .split('|')
        .slice(1, -1)
        .map((s) => s.trim());
      if (!label || !rateDisplay || !basis)
        throw new Error('The current Annex A contains an invalid row.');
      const numeric = rateDisplay.match(/^(\d+(?:\.\d+)?)%/);
      return {
        key: keys[label] ?? `canonical-annex-a-${index}`,
        label,
        rateDisplay,
        rateValue: numeric ? Number(numeric[1]) : null,
        basis,
        vatNote: '',
        status: (status === 'Live' || status === 'LIVE' || !status
          ? 'LIVE'
          : status) as RateRow['status'],
        sortOrder: index,
      };
    });
}

export function canonicalAnnexCSummary(content: string): string[] {
  const annex = documentSections(content).find((s) => /^Annex C\b/i.test(s.title));
  if (!annex) throw new Error('The current Vendor Terms have no Annex C.');
  return annex.content
    .split('\n')
    .filter((line) => /^[-*] |\d+\. /.test(line))
    .map((line) => line.replace(/^([-*] |\d+\. )/, '').replace(/\*\*/g, ''));
}

export function canonicalTermsNotice(content: string): string {
  const changes = documentSections(content).find((s) =>
    /^\d+\.\s*Changes to these terms/i.test(s.title),
  );
  if (!changes) throw new Error('The current Vendor Terms have no change-notice clause.');
  return changes.content.split(/\n\s*\n/)[0]?.trim() ?? '';
}

export function sectionId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Server component: fetches the live commission rate schedule and renders
 * Layer 1 (KeyTermsSummary) and Layer 2 (RateCard) above the full terms text.
 *
 * P2B Regulation requires "key commercial conditions" to be presented
 * prominently and in plain language before any contracting stage. The full
 * terms page is Layer 3; these panels give prospective vendors the first
 * two layers before they scroll into the legal text.
 */

import { KeyTermsSummary, RateCard } from '@feastpot/ui';
import type { RateRow } from '@feastpot/ui';

async function fetchRateSchedule(): Promise<RateRow[]> {
  try {
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';
    const res = await fetch(`${apiBase}/v1/terms/rate-schedule`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json() as Promise<RateRow[]>;
  } catch {
    return [];
  }
}

export async function LegalLayers() {
  const rates = await fetchRateSchedule();

  return (
    <div className="mb-10 grid gap-4 lg:grid-cols-2">
      {/* Layer 1: key terms in plain language (Annex C) */}
      <KeyTermsSummary />
      {/* Layer 2: live commission rate schedule (Annex A) */}
      <RateCard rates={rates} />
    </div>
  );
}

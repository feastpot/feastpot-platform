/**
 * Server-side helper: fetch the standard (first-order marketplace) commission
 * rate from the public rate-schedule endpoint. Used by the vendor terms page
 * to render the rate in the legal prose without hardcoding a string.
 *
 * Falls back to PLATFORM_FACTS.commission.marketplaceFirst if the API is
 * unavailable during static generation (so the page still builds correctly).
 */
import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

export async function fetchStandardCommissionRate(): Promise<number> {
  try {
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';
    const res = await fetch(`${apiBase}/v1/terms/rate-schedule`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return PLATFORM_FACTS.commission.marketplaceFirst;
    const rows = (await res.json()) as Array<{ key: string; rateValue: number | null }>;
    const standard = rows.find((r) => r.key === 'standard_commission');
    return standard?.rateValue ?? PLATFORM_FACTS.commission.marketplaceFirst;
  } catch {
    return PLATFORM_FACTS.commission.marketplaceFirst;
  }
}

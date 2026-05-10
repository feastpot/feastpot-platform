/**
 * Tiny formatting helpers shared across the vendor portal.
 * All currency values in the API are integer pence (GBP).
 */
const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export function formatPence(pence: number | null | undefined): string {
  if (pence === null || pence === undefined) return '—';
  return GBP.format(pence / 100);
}

export function pencePerPound(pounds: number): number {
  // We round to the nearest pence to dodge floating-point garbage like 1299.9999.
  return Math.round(pounds * 100);
}

export function poundsFromPence(pence: number): number {
  return Math.round(pence) / 100;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

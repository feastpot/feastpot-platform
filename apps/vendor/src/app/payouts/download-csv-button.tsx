'use client';

import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { useAccessToken } from '@/lib/auth/use-access-token';
import { API_URL } from '@/lib/env';

/**
 * CSV download trigger (T006). Bearer-token endpoints can't be opened
 * with a plain anchor, so we fetch the CSV as a blob, then synthesize
 * an object-URL anchor and click it. The object URL is revoked on the
 * next tick to free memory.
 */
export function DownloadCsvButton() {
  const { token } = useAccessToken();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/v1/payouts/export.csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename = `feastpot-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || !token}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-dark transition-colors hover:bg-surface disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden />
        )}
        {busy ? 'Preparing…' : 'Download statement'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

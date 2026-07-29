'use client';

import { useToast } from '@/components/ui/toaster';
import { useApi } from '@/hooks/use-api';
import { apiUrl } from '@/lib/api/client';

/**
 * Shared CSV-export hook for admin list pages.
 *
 * CSV endpoints need the Bearer header, so we fetch as a Blob and trigger a
 * synthetic download rather than using a plain <a href>. Errors surface as a
 * toast - an export failure should never navigate away from the list.
 *
 * @returns download(path, filenameBase) - path is the API path incl. query
 *   string (e.g. `/admin/users.csv?role=customer`); filenameBase gets the
 *   current date appended (`users-2026-07-30.csv`).
 */
export function useDownloadCsv() {
  const { token } = useApi();
  const { toast } = useToast();

  return async function download(path: string, filenameBase: string) {
    if (!token) {
      toast({ title: 'Not signed in', variant: 'destructive' });
      return;
    }
    try {
      const res = await fetch(apiUrl(path), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const dl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dl;
      a.download = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dl);
    } catch (err) {
      toast({
        title: 'CSV download failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };
}

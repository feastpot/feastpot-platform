'use client';

import { useCallback, useEffect, useState } from 'react';

interface Incident {
  id: string;
  ref: string;
  app: string;
  route: string;
  message: string;
  digest: string | null;
  vendorId: string | null;
  userId: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface Props {
  accessToken: string;
  apiUrl: string;
}

export function IncidentsClient({ accessToken, apiUrl }: Props) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(
    async (ref?: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = ref
          ? `${apiUrl}/v1/error-incidents?ref=${encodeURIComponent(ref)}`
          : `${apiUrl}/v1/error-incidents?limit=50`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 404) {
          setIncidents([]);
          setError(`No incident found for ref ${ref ?? ''}`);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setIncidents(Array.isArray(data) ? (data as Incident[]) : [data as Incident]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [accessToken, apiUrl],
  );

  useEffect(() => {
    void fetch_();
  }, [fetch_]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = search.trim().toUpperCase();
    void fetch_(trimmed || undefined);
  };

  const handleClear = () => {
    setSearch('');
    void fetch_();
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="FP-XXXX-XXXX"
          className="fp-input w-60 font-mono text-sm"
          spellCheck={false}
          aria-label="Search by incident ref"
        />
        <button type="submit" className="btn-primary text-sm">
          Look up
        </button>
        {search && (
          <button type="button" onClick={handleClear} className="btn-ghost text-sm">
            Clear
          </button>
        )}
      </form>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : incidents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No incidents found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Ref</th>
                <th className="px-4 py-2.5 text-left font-semibold">App</th>
                <th className="px-4 py-2.5 text-left font-semibold">Route</th>
                <th className="px-4 py-2.5 text-left font-semibold">Message</th>
                <th className="px-4 py-2.5 text-left font-semibold">Vendor ID</th>
                <th className="px-4 py-2.5 text-left font-semibold">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {incidents.map((inc) => (
                <tr key={inc.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-brand">
                    {inc.ref}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{inc.app}</td>
                  <td className="max-w-[160px] truncate px-4 py-3 font-mono text-xs">
                    {inc.route}
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-3 text-muted-foreground">
                    {inc.message}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {inc.vendorId ? inc.vendorId.slice(0, 8) + '...' : ': '}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {new Date(inc.createdAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {incidents.length} incident{incidents.length !== 1 ? 's' : ''}. Only the most recent
        50 are shown without a search filter.
      </p>
    </div>
  );
}

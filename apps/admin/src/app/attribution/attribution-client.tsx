'use client';

import { Download } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useApi } from '@/hooks/use-api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.feastpot.co.uk';

interface AttributionRow {
  id: string;
  orderId: string;
  source: 'MARKETPLACE' | 'VENDOR_REFERRED';
  isFirstOrder: boolean;
  attributionReason: string;
  referralLinkId: string | null;
  referralClickId: string | null;
  attributedAt: string;
  order: {
    orderNumber: string;
    totalPence: number;
    createdAt: string;
    vendor: { businessName: string };
    customer?: { email: string } | null;
  };
}

interface ListResult {
  rows: AttributionRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface Filters {
  source: string;
  from: string;
  to: string;
}

function formatGbp(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

const SOURCE_LABELS: Record<string, string> = {
  MARKETPLACE: 'Marketplace',
  VENDOR_REFERRED: 'Vendor referred',
};

const SOURCE_COLORS: Record<string, string> = {
  MARKETPLACE: 'bg-blue-50 text-blue-700',
  VENDOR_REFERRED: 'bg-teal-50 text-teal-700',
};

interface AttributionClientProps {
  role: string;
}

export function AttributionClient({ role }: AttributionClientProps) {
  const { request, token, ready } = useApi();
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<Filters>({ source: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    if (applied.source) params.set('source', applied.source);
    if (applied.from) params.set('from', applied.from);
    if (applied.to) params.set('to', applied.to);
    params.set('page', String(page));
    try {
      const res = await request<ListResult>(`/attribution/admin/list?${params.toString()}`);
      setData(res);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [request, ready, applied, page]);

  useEffect(() => { void load(); }, [load]);

  function applyFilters() {
    setApplied({ source, from, to });
    setPage(1);
  }

  function clearFilters() {
    setSource('');
    setFrom('');
    setTo('');
    setApplied({ source: '', from: '', to: '' });
    setPage(1);
  }

  async function downloadCsv() {
    if (!token) return;
    const params = new URLSearchParams();
    if (applied.source) params.set('source', applied.source);
    if (applied.from) params.set('from', applied.from);
    if (applied.to) params.set('to', applied.to);
    const res = await fetch(`${API_URL}/v1/attribution/admin/export.csv?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attribution-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canExport = role === 'admin' || role === 'finance';

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-mid">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="">All sources</option>
              <option value="MARKETPLACE">Marketplace</option>
              <option value="VENDOR_REFERRED">Vendor referred</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-mid">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-mid">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-lg bg-teal px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-dark"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-mid hover:bg-surface"
          >
            Clear
          </button>
          {canExport && (
            <button
              type="button"
              onClick={() => void downloadCsv()}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-dark hover:bg-surface"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading && <div className="h-64 animate-pulse rounded-xl bg-surface" />}
      {error && <p className="text-sm text-red-600">Failed to load attribution data.</p>}
      {data && !loading && (
        <>
          <p className="text-sm text-mid">{data.total.toLocaleString()} records</p>
          <div className="overflow-x-auto rounded-xl border border-border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  {['Order #', 'Vendor', 'Customer', 'Source', 'Reason', 'First order', 'Total', 'Attributed at'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-mid">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-mid">
                      No records match the current filters.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface/50">
                      <td className="px-4 py-3 font-mono text-xs">{row.order.orderNumber}</td>
                      <td className="px-4 py-3">{row.order.vendor.businessName}</td>
                      <td className="px-4 py-3 text-mid">{row.order.customer?.email ?? '--'}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[row.source] ?? ''}`}>
                          {SOURCE_LABELS[row.source] ?? row.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-mid">{row.attributionReason}</td>
                      <td className="px-4 py-3 text-center">
                        {row.isFirstOrder ? (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Yes</span>
                        ) : (
                          <span className="text-mid">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{formatGbp(row.order.totalPence)}</td>
                      <td className="px-4 py-3 text-xs text-mid">
                        {new Date(row.attributedAt).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.total > data.pageSize && (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-mid">
                Page {page} of {Math.ceil(data.total / data.pageSize)}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * data.pageSize >= data.total}
                className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

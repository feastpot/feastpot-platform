'use client';

import { useEffect, useState } from 'react';

import { RateCard } from '@feastpot/ui';
import type { RateRow } from '@feastpot/ui';

import { createClient } from '@/lib/supabase/client';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

function p(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function pct(n: number) {
  return `${n.toFixed(2)}%`;
}

interface BySource {
  source: string;
  orderCount: number;
  foodSubtotalPence: number;
  commissionPence: number;
  effectiveRatePct: number;
}

interface Summary {
  blendedRatePct: number;
  savedPence: number;
  bySource: BySource[];
}

interface EarningsData {
  period: Summary;
  cumulative: Summary;
}

const SOURCE_LABELS: Record<string, { label: string; colour: string; note: string }> = {
  MARKETPLACE: {
    label: 'Marketplace',
    colour: 'bg-blue-100 text-blue-800',
    note: 'Orders from the Feastpot marketplace (10–12% rate)',
  },
  VENDOR_REFERRED: {
    label: 'Your referrals',
    colour: 'bg-green-100 text-green-800',
    note: 'Customers you brought directly (0% rate)',
  },
};

export function EarningsClient() {
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Layer 2: fetch live rates from the public API so this page
  // always matches the legal Rate Schedule (Annex A).
  const [rates, setRates] = useState<RateRow[]>([]);
  const [ratesLoading, setRatesLoading] = useState(true);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setError('Not authenticated');
          return;
        }
        const res = await fetch(
          `${API}/v1/payouts/earnings-summary?year=${year}&month=${month}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const json = (await res.json()) as EarningsData;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  // Fetch live rates from the public rate-schedule endpoint.
  useEffect(() => {
    fetch(`${API}/v1/terms/rate-schedule`)
      .then((r) => r.json())
      .then((d) => setRates(d as RateRow[]))
      .catch(() => null)
      .finally(() => setRatesLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-gray-200" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-28 rounded-xl bg-gray-200" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <p className="text-red-600">{error ?? 'No data'}</p>
      </div>
    );
  }

  const { period, cumulative } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Earnings &amp; fees</h1>
        <p className="mt-1 text-sm text-gray-500">
          {new Date(year, month - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ─── This month KPI cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Blended rate this month"
          value={pct(period.blendedRatePct)}
          sub="Weighted average across all orders"
          highlight={period.blendedRatePct < 10}
        />
        <StatCard
          label="Saved vs standard rate"
          value={p(period.savedPence)}
          sub="Thanks to referrals &amp; repeat customers"
          highlight={period.savedPence > 0}
        />
        <StatCard
          label="Saved all-time"
          value={p(cumulative.savedPence)}
          sub="Cumulative since you joined"
          highlight={cumulative.savedPence > 0}
        />
      </div>

      {/* ─── This month by source ─────────────────────────────────────────── */}
      {period.bySource.length > 0 && (
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
            This month -- by source
          </h2>
          <div className="space-y-3">
            {period.bySource.map((row) => {
              const info = SOURCE_LABELS[row.source] ?? {
                label: row.source,
                colour: 'bg-gray-100 text-gray-700',
                note: '',
              };
              return (
                <div key={row.source} className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${info.colour}`}
                  >
                    {info.label}
                  </span>
                  <div className="flex-1 text-sm">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-700">
                      <span>{row.orderCount} orders</span>
                      <span>Food subtotal {p(row.foodSubtotalPence)}</span>
                      <span>Commission {p(row.commissionPence)}</span>
                      <span className="font-medium">
                        Effective rate {pct(row.effectiveRatePct)}
                      </span>
                    </div>
                    {info.note && (
                      <p className="mt-0.5 text-xs text-gray-400">{info.note}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {period.bySource.length === 0 && (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center shadow-sm">
          <p className="text-gray-500">No completed orders this month yet.</p>
        </div>
      )}

      {/* ─── Rate card (Layer 2 – live from the API) ─────────────────────── */}
      <RateCard rates={rates} loading={ratesLoading} />

      {/* ─── CTA ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-green-50 p-5">
        <p className="font-semibold text-green-800">
          Grow your referrals to keep more of every order
        </p>
        <p className="mt-1 text-sm text-green-700">
          Every customer you bring directly pays 0% commission -- that&apos;s the full food subtotal
          staying with you. Share your link or QR code to turn one-time customers into regulars.
        </p>
        <a
          href="/referrals"
          className="mt-3 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          Get your referral link →
        </a>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ${highlight ? 'border-green-200 bg-green-50' : 'bg-white'}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${highlight ? 'text-green-700' : 'text-gray-900'}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  );
}

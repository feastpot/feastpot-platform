'use client';

import { useCallback, useEffect, useState } from 'react';

import { API_URL } from '@/lib/env';
import { createClient } from '@/lib/supabase/client';

const API = API_URL;

interface CommissionRate {
  id: string;
  source: string;
  isFirstOrder: boolean | null;
  ratePercent: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: string;
  note: string | null;
}

interface TakeRate {
  blendedPct: number;
  totalCommissionPence: number;
  totalSubtotalPence: number;
  orderCount: number;
}

function p(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function srcLabel(source: string, isFirstOrder: boolean | null) {
  if (source === 'VENDOR_REFERRED') return 'Vendor-referred (all orders)';
  if (isFirstOrder === true) return 'Marketplace – first order';
  if (isFirstOrder === false) return 'Marketplace – repeat order';
  return source;
}

async function getToken(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function apiFetch<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

export function CommissionRatesClient() {
  const [rates, setRates] = useState<CommissionRate[]>([]);
  const [takeRate, setTakeRate] = useState<TakeRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [fSource, setFSource] = useState<string>('MARKETPLACE');
  const [fIsFirstOrder, setFIsFirstOrder] = useState<string>('true');
  const [fRatePct, setFRatePct] = useState<string>('');
  const [fEffectiveFrom, setFEffectiveFrom] = useState<string>('');
  const [fNote, setFNote] = useState<string>('');

  const load = useCallback(async () => {
    try {
      const [r, tr] = await Promise.all([
        apiFetch<CommissionRate[]>('/v1/admin/commission-rates'),
        apiFetch<TakeRate>('/v1/admin/commission-rates/take-rate?period=monthly'),
      ]);
      setRates(r);
      setTakeRate(tr);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const token = await getToken();
      const body = {
        source: fSource,
        isFirstOrder: fSource === 'VENDOR_REFERRED' ? null : fIsFirstOrder === 'true',
        ratePercent: parseFloat(fRatePct),
        effectiveFrom: fEffectiveFrom,
        note: fNote || undefined,
      };
      const res = await fetch(`${API}/v1/admin/commission-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message ?? `API ${res.status}`);
      }
      setShowForm(false);
      setFRatePct('');
      setFEffectiveFrom('');
      setFNote('');
      await load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-gray-200" />
          <div className="h-48 rounded-xl bg-gray-200" />
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-red-600">{error}</div>;
  }

  // Active rates are those without effectiveTo.
  const active = rates.filter((r) => !r.effectiveTo);
  const history = rates.filter((r) => r.effectiveTo);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Commission rates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Source-based rate engine. Changes create a new row -- existing rows are never mutated.
            Rate increases require 15 days&apos; notice before effectiveFrom.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
        >
          {showForm ? 'Cancel' : 'New rate'}
        </button>
      </div>

      {/* ─── Take-rate KPIs ───────────────────────────────────────────────── */}
      {takeRate && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard label="Blended rate (MTD)" value={`${takeRate.blendedPct.toFixed(2)}%`} />
          <KpiCard label="Total commission (MTD)" value={p(takeRate.totalCommissionPence)} />
          <KpiCard label="Food GMV (MTD)" value={p(takeRate.totalSubtotalPence)} />
          <KpiCard label="Orders (MTD)" value={String(takeRate.orderCount)} />
        </div>
      )}

      {/* ─── New rate form ────────────────────────────────────────────────── */}
      {showForm && (
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="rounded-xl border bg-white p-5 shadow-sm space-y-4"
        >
          <h2 className="font-semibold">Create new rate</h2>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-gray-500">Order source</span>
              <select
                value={fSource}
                onChange={(e) => setFSource(e.target.value)}
                className="mt-1 block w-full rounded border px-3 py-2 text-sm"
              >
                <option value="MARKETPLACE">Marketplace</option>
                <option value="VENDOR_REFERRED">Vendor-referred</option>
              </select>
            </label>
            {fSource !== 'VENDOR_REFERRED' && (
              <label className="block">
                <span className="text-xs text-gray-500">First order?</span>
                <select
                  value={fIsFirstOrder}
                  onChange={(e) => setFIsFirstOrder(e.target.value)}
                  className="mt-1 block w-full rounded border px-3 py-2 text-sm"
                >
                  <option value="true">First order with vendor</option>
                  <option value="false">Repeat order</option>
                </select>
              </label>
            )}
            <label className="block">
              <span className="text-xs text-gray-500">Rate % (e.g. 10.00)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                value={fRatePct}
                onChange={(e) => setFRatePct(e.target.value)}
                className="mt-1 block w-full rounded border px-3 py-2 text-sm"
                placeholder="10.00"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">
                Effective from (UTC, ≥15 days if increase)
              </span>
              <input
                type="datetime-local"
                required
                value={fEffectiveFrom}
                onChange={(e) => setFEffectiveFrom(e.target.value)}
                className="mt-1 block w-full rounded border px-3 py-2 text-sm"
              />
            </label>
            <label className="col-span-2 block">
              <span className="text-xs text-gray-500">Note (optional)</span>
              <input
                type="text"
                value={fNote}
                onChange={(e) => setFNote(e.target.value)}
                className="mt-1 block w-full rounded border px-3 py-2 text-sm"
                placeholder="Reason for change"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create rate'}
          </button>
        </form>
      )}

      {/* ─── Active rates ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Active rates</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Segment</th>
              <th className="px-4 py-2 text-right">Rate</th>
              <th className="px-4 py-2 text-left">Effective from</th>
              <th className="px-4 py-2 text-left">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {active.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{srcLabel(r.source, r.isFirstOrder)}</td>
                <td className="px-4 py-3 text-right font-mono">{r.ratePercent}%</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(r.effectiveFrom).toLocaleDateString('en-GB')}
                </td>
                <td className="px-4 py-3 text-gray-400">{r.note ?? '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── History ────────────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-500">Rate history</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Segment</th>
                <th className="px-4 py-2 text-right">Rate</th>
                <th className="px-4 py-2 text-left">Effective</th>
                <th className="px-4 py-2 text-left">Closed</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-400">
              {history.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{srcLabel(r.source, r.isFirstOrder)}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.ratePercent}%</td>
                  <td className="px-4 py-3">
                    {new Date(r.effectiveFrom).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-4 py-3">
                    {r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString('en-GB') : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

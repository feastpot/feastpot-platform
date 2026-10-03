'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { UserError } from '@/lib/user-error';

type Report = {
  mode: string;
  objectCount: number;
  referenceCount: number;
  orphanCount: number;
  missingCount: number;
  orphaned: Array<{ bucket_id: string; name: string }>;
  missing: Array<{ owner_table: string; owner_id: string; bucket: string; path: string }>;
  pendingCleanup: Array<{ locator: string; reason: string; attempts: number }>;
  samplesTruncated: boolean;
};
type Saved = { id: string; data: Report; created_at: string };

export function StorageReportClient({ accessToken }: { accessToken: string }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['storage-reconciliation'],
    staleTime: 30_000,
    queryFn: () =>
      apiRequest<Saved | null>('/admin/storage-reconciliation/latest', { accessToken }),
  });
  const run = useMutation({
    mutationFn: () =>
      apiRequest<Report & { id: string }>('/admin/storage-reconciliation/report', {
        method: 'POST',
        accessToken,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['storage-reconciliation'] }),
  });
  const data = query.data?.data;
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => run.mutate()}
        disabled={run.isPending}
        className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
      >
        {run.isPending ? 'Generating report...' : 'Run report (no deletion)'}
      </button>
      {query.isLoading && <p>Loading latest report...</p>}
      {query.error && (
        <UserError error={query.error} message="Could not load the storage report." />
      )}
      {run.error && (
        <UserError error={run.error} message="Could not generate the storage report." />
      )}
      {!query.isLoading && !query.error && !data && (
        <p>No report has run yet. Generate a report above, or wait for the daily scheduled run.</p>
      )}
      {data && (
        <>
          <p className="text-sm text-muted-foreground">
            Saved {new Date(query.data!.created_at).toLocaleString('en-GB')} · Report{' '}
            {query.data!.id} · Report-only
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Objects', data.objectCount],
              ['Unreferenced objects', data.orphanCount],
              ['Missing objects', data.missingCount],
              ['Pending cleanup (shown)', data.pendingCleanup.length],
            ].map(([label, count]) => (
              <div key={label} className="rounded-lg border p-4">
                <p className="text-sm">{label}</p>
                <p className="text-2xl font-semibold">{count}</p>
              </div>
            ))}
          </div>
          {data.samplesTruncated && (
            <p>
              Samples are limited to 5,000 entries per category. Counts cover the complete
              inventory.
            </p>
          )}
          <details open className="rounded-lg border p-4">
            <summary className="font-semibold">
              Objects without a referencing row ({data.orphanCount})
            </summary>
            <div className="mt-3 max-h-96 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th>Object path</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orphaned.map((row) => (
                    <tr key={`${row.bucket_id}/${row.name}`} className="border-t">
                      <td className="py-2 pr-3">{row.bucket_id}</td>
                      <td className="break-all">{row.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.orphaned.length && <p>No unreferenced objects found.</p>}
            </div>
          </details>
          <details open className="rounded-lg border p-4">
            <summary className="font-semibold">
              Rows referencing missing objects ({data.missingCount})
            </summary>
            <div className="mt-3 max-h-96 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Record</th>
                    <th>Object path</th>
                  </tr>
                </thead>
                <tbody>
                  {data.missing.map((row, i) => (
                    <tr key={`${row.owner_id}/${row.path}/${i}`} className="border-t">
                      <td className="py-2 pr-3">
                        {row.owner_table}: {row.owner_id}
                      </td>
                      <td className="break-all">
                        {row.bucket}/{row.path}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.missing.length && <p>No missing objects found.</p>}
            </div>
          </details>
          <details className="rounded-lg border p-4">
            <summary className="font-semibold">Known cleanup work awaiting completion</summary>
            <p className="my-2 text-sm">
              Failed deletions retry every five minutes. New uploads have a one-hour commit grace
              period; a referencing row always prevents cleanup.
            </p>
            <ul className="space-y-2 text-sm">
              {data.pendingCleanup.map((row) => (
                <li key={row.locator} className="break-all">
                  {row.locator} · {row.reason} · {row.attempts} attempts
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}

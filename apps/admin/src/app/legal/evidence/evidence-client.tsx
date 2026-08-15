'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@feastpot/ui';
import { Download, FileJson, Info } from 'lucide-react';
import { useState } from 'react';

import { useToast } from '@/components/ui/toaster';
import { useEvidenceExport } from '@/hooks/use-legal';

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function EvidenceExportClient() {
  const { toast } = useToast();
  const exportEvidence = useEvidenceExport();
  const [vendorId, setVendorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  function handleExport() {
    if (!vendorId.trim()) return;
    setPreview(null);
    exportEvidence.mutate(
      { vendorId: vendorId.trim(), from: from || undefined, to: to || undefined },
      {
        onSuccess: (data) => {
          setPreview(data);
          const bundle = data as { vendor?: { businessName?: string }; exportedAt?: string };
          const name = bundle.vendor?.businessName?.replace(/\s+/g, '-') ?? 'vendor';
          const date =
            (bundle.exportedAt as string | undefined)?.slice(0, 10) ??
            new Date().toISOString().slice(0, 10);
          downloadJson(data, `evidence-${name}-${date}.json`);
          toast({
            title: 'Evidence bundle downloaded',
            description: `${name} - ${date}`,
          });
        },
        onError: (err) =>
          toast({
            title: 'Export failed',
            description: err instanceof Error ? err.message : 'Unknown error',
            variant: 'destructive',
          }),
      },
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Evidence export</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate a complete, verifiable bundle for a vendor containing every terms acceptance with
          content hash, notice records, and enforcement actions. This is what you hand an insurer, a
          regulator, or a solicitor if a dispute escalates.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate bundle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="label-xs">Vendor ID *</label>
            <Input
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              placeholder="Paste vendor UUID"
              className="mt-1 font-mono"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Find the vendor UUID on their vendor detail page in the URL or Profile card.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-xs">From (optional)</label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="label-xs">To (optional)</label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave date fields blank to export the full history.
          </p>
          <Button onClick={handleExport} disabled={!vendorId.trim() || exportEvidence.isPending}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden />
            {exportEvidence.isPending ? 'Generating...' : 'Generate and download bundle'}
          </Button>
        </CardContent>
      </Card>

      {/* What the bundle contains */}
      <Card className="border-muted">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
            Bundle contents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              ['Vendor record', 'businessName, status, createdAt, slug'],
              [
                'Terms acceptances',
                'acceptedAt, method, IP address, SHA-256 content hash, scrolledToEnd flag, acceptance text, version metadata',
              ],
              [
                'Notice records',
                'sentAt, channel, deliveredAt, openedAt, acknowledgedAt, version metadata',
              ],
              [
                'Enforcement actions',
                'actionType, reasonCode, reasonNarrative, facts, effectiveAt, noticeSentAt, urgentBasis, liftedAt',
              ],
              ['Integrity note', 'Instructions for verifying each acceptance via content hash'],
            ].map(([title, detail]) => (
              <li key={title as string} className="flex items-start gap-2">
                <FileJson className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <strong className="text-foreground">{title as string}:</strong> {detail as string}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Preview summary if just generated */}
      {preview &&
        (() => {
          const b = preview as {
            vendor?: { businessName?: string; status?: string };
            acceptances?: unknown[];
            notices?: unknown[];
            enforcementActions?: unknown[];
            exportedAt?: string;
            exportPeriod?: { from?: string; to?: string };
          };
          return (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-sm text-green-800">Bundle generated</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-green-700">
                      Vendor
                    </dt>
                    <dd className="font-medium text-green-900">{b.vendor?.businessName ?? '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-green-700">
                      Acceptances
                    </dt>
                    <dd className="font-medium text-green-900">{b.acceptances?.length ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-green-700">
                      Notices
                    </dt>
                    <dd className="font-medium text-green-900">{b.notices?.length ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-green-700">
                      Enforcement actions
                    </dt>
                    <dd className="font-medium text-green-900">
                      {b.enforcementActions?.length ?? 0}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-green-700">
                  Exported at {b.exportedAt ? new Date(b.exportedAt).toLocaleString('en-GB') : '-'}.
                  The file was downloaded automatically.
                </p>
              </CardContent>
            </Card>
          );
        })()}
    </div>
  );
}

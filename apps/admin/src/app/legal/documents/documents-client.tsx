'use client';

import { Card, CardContent, CardHeader, CardTitle, Input, Button } from '@feastpot/ui';
import { CheckCircle2, Clock, FileText, Lock, Plus, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toaster';
import {
  useAdminTermsVersions,
  usePublishTermsVersion,
  type DocType,
  type PublishVersionInput,
} from '@/hooks/use-legal';
import { formatDate, formatDateTime } from '@/lib/format';

const STATUS_TONE = { live: 'success', pending: 'warning', superseded: 'neutral' } as const;
const DOC_TYPE_LABELS: Record<DocType, string> = {
  VENDOR_TERMS: 'Vendor terms',
  CUSTOMER_TERMS: 'Customer terms',
  PRIVACY: 'Privacy policy',
  COOKIES: 'Cookie policy',
  RATE_SCHEDULE: 'Rate schedule',
};

const MIN_NOTICE_DAYS = 15;
function minEffectiveDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + MIN_NOTICE_DAYS);
  return d.toISOString().slice(0, 10);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function DocumentsClient() {
  const { data: versions, isLoading } = useAdminTermsVersions();
  const publish = usePublishTermsVersion();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PublishVersionInput>({
    documentType: 'VENDOR_TERMS',
    version: '',
    contentMdx: '',
    changeSummary: '',
    isMaterial: true,
    effectiveAt: minEffectiveDate(),
    createdBy: '',
    solicitorSignOff: '',
  });
  const [error, setError] = useState<string | null>(null);

  const isMaterial = form.isMaterial;
  const needsSolicitor = form.documentType === 'VENDOR_TERMS';
  const publishDisabled =
    !form.version ||
    !form.contentMdx.trim() ||
    !form.changeSummary.trim() ||
    !form.createdBy.trim() ||
    (needsSolicitor && !form.solicitorSignOff?.trim()) ||
    publish.isPending;

  function field(k: keyof PublishVersionInput) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const val = k === 'isMaterial' ? (e.target as HTMLInputElement).checked : e.target.value;
      setForm((p) => ({ ...p, [k]: val }));
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload: PublishVersionInput = {
      ...form,
      solicitorSignOff: form.solicitorSignOff?.trim() || undefined,
    };
    publish.mutate(payload, {
      onSuccess: () => {
        toast({ title: 'Version published', description: `v${form.version} is now live.` });
        setFormOpen(false);
        setForm((p) => ({ ...p, version: '', contentMdx: '', changeSummary: '' }));
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Publish failed'),
    });
  }

  // Group by document type
  const byType = new Map<string, typeof versions>();
  if (versions) {
    for (const v of versions) {
      if (!byType.has(v.documentType)) byType.set(v.documentType, []);
      byType.get(v.documentType)!.push(v);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Legal documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All versions across all document types. Publishing VENDOR_TERMS requires solicitor
            sign-off and a minimum 15-day effective date for material changes.
          </p>
        </div>
        <Button onClick={() => setFormOpen((v) => !v)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Publish new version
        </Button>
      </div>

      {/* Publish form */}
      {formOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publish new version</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-xs">Document type *</label>
                  <select
                    value={form.documentType}
                    onChange={field('documentType')}
                    className="fp-admin-input mt-1 w-full"
                  >
                    {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-xs">Version string *</label>
                  <Input
                    value={form.version}
                    onChange={field('version')}
                    placeholder="e.g. 2.1.0"
                    required
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-xs">
                    Effective date *{' '}
                    {isMaterial ? `(min ${minEffectiveDate()})` : '(any date - non-material)'}
                  </label>
                  <Input
                    type="date"
                    value={form.effectiveAt}
                    onChange={field('effectiveAt')}
                    min={isMaterial ? minEffectiveDate() : todayIso()}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="label-xs">Published by (name / email) *</label>
                  <Input
                    value={form.createdBy}
                    onChange={field('createdBy')}
                    placeholder="e.g. Sarah Jenkins"
                    required
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="isMaterial"
                  type="checkbox"
                  checked={form.isMaterial}
                  onChange={field('isMaterial')}
                  className="h-4 w-4 rounded border-border"
                />
                <label htmlFor="isMaterial" className="text-sm font-medium">
                  Material change (requires 15-day notice period and vendor re-acceptance)
                </label>
              </div>

              {needsSolicitor && (
                <div>
                  <label className="label-xs flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-destructive" aria-hidden />
                    Solicitor sign-off *{' '}
                    <span className="font-normal text-muted-foreground">
                      (required for VENDOR_TERMS - publishing is impossible without this)
                    </span>
                  </label>
                  <Input
                    value={form.solicitorSignOff ?? ''}
                    onChange={field('solicitorSignOff')}
                    placeholder={'Reviewed and approved by [solicitor name] on [date]'}
                    required={needsSolicitor}
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    The API rejects VENDOR_TERMS without this field. Enter exactly as it appears on
                    the solicitor&apos;s confirmation email.
                  </p>
                </div>
              )}

              <div>
                <label className="label-xs">
                  Change summary * {!isMaterial && '(must explain why this is editorial only)'}
                </label>
                <textarea
                  value={form.changeSummary}
                  onChange={field('changeSummary')}
                  rows={3}
                  required
                  placeholder={
                    isMaterial
                      ? 'Plain-language summary of what changed...'
                      : 'Editorial justification: what was corrected and why it does not alter meaning...'
                  }
                  className="fp-admin-input mt-1 w-full"
                />
              </div>

              <div>
                <label className="label-xs">Document content (Markdown / MDX) *</label>
                <textarea
                  value={form.contentMdx}
                  onChange={field('contentMdx')}
                  rows={12}
                  required
                  placeholder="# Feastpot Vendor Terms&#10;&#10;..."
                  className="fp-admin-input mt-1 w-full font-mono text-xs"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  SHA-256 content hash is computed on publish. Once published, content is immutable
                  - corrections require a new version.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-red-50 p-3 text-sm text-destructive">
                  <XCircle className="h-4 w-4 shrink-0" aria-hidden />
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={publishDisabled}>
                  {publish.isPending ? 'Publishing...' : 'Publish version'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Version list */}
      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {versions && (
        <div className="space-y-6">
          {Array.from(byType.entries()).map(([docType, rows]) => (
            <Card key={docType}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {DOC_TYPE_LABELS[docType as DocType] ?? docType}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pl-4 text-left font-semibold">Version</th>
                      <th className="py-2 text-left font-semibold">Status</th>
                      <th className="py-2 text-left font-semibold">Effective</th>
                      <th className="py-2 text-left font-semibold">Material</th>
                      <th className="py-2 text-left font-semibold">Acceptances</th>
                      <th className="py-2 text-left font-semibold">Notices</th>
                      <th className="py-2 text-left font-semibold">Solicitor</th>
                      <th className="py-2 pr-4 text-left font-semibold">Published by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows!.map((v) => (
                      <tr key={v.id} className="hover:bg-muted/30">
                        <td className="py-2.5 pl-4 font-mono font-medium">
                          <Link href={`/legal/documents/${v.id}`} className="hover:underline">
                            v{v.version}
                          </Link>
                        </td>
                        <td className="py-2.5">
                          <StatusPill tone={STATUS_TONE[v.status]}>{v.status}</StatusPill>
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {formatDate(v.effectiveAt)}
                        </td>
                        <td className="py-2.5">
                          {v.isMaterial ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Yes" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" aria-label="No" />
                          )}
                        </td>
                        <td className="py-2.5 tabular-nums">{v._count.acceptances}</td>
                        <td className="py-2.5 tabular-nums">{v._count.notices}</td>
                        <td className="py-2.5">
                          {v.solicitorSignOff ? (
                            <CheckCircle2
                              className="h-4 w-4 text-green-600"
                              aria-label="Signed off"
                            />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground">{v.createdBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

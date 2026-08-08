'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Info,
  RefreshCw,
} from 'lucide-react';
import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { useState } from 'react';

import {
  useMyReports,
  useMyTaxProfile,
  usePrefillFromStripe,
  useUpsertTaxProfile,
  type PlatformReport,
  type TaxEntityType,
  type UpsertTaxProfileInput,
  type VendorTaxProfile,
  type VerificationStatus,
} from '@/hooks/use-tax-profile';

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_TYPES: { value: TaxEntityType; label: string }[] = [
  { value: 'SOLE_TRADER', label: 'Sole trader / individual' },
  { value: 'LIMITED_COMPANY', label: 'Limited company' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
];

const STATUS_BADGE: Record<VerificationStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Pending review', cls: 'bg-amber-100 text-amber-800' },
  VERIFIED: { label: 'Verified', cls: 'bg-green-100 text-green-700' },
  FAILED: { label: 'Update required', cls: 'bg-red-100 text-red-700' },
  EXEMPT: { label: 'Exempt', cls: 'bg-neutral-100 text-neutral-600' },
};

function formatPounds(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TaxInformationClient() {
  const { data: profile, isLoading: profileLoading } = useMyTaxProfile();
  const { data: reports, isLoading: reportsLoading } = useMyReports();

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold text-dark">Tax information</h1>
        <p className="mt-1 text-sm text-mid">
          Under the{' '}
          <a
            href="https://www.legislation.gov.uk/uksi/2023/817/contents"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-teal"
          >
            Platform Operators Regulations 2023 (SI 2023/817)
          </a>
          , FeastPot is required to collect and verify your tax details and report your activity
          annually to HMRC. This page shows what we hold and what we have reported.
        </p>
      </div>

      <VerificationBanner profile={profile} />
      <TaxProfileSection profile={profile} />

      <div>
        <h2 className="mb-3 text-base font-bold text-dark">Annual reports</h2>
        {reportsLoading ? (
          <p className="text-sm text-mid">Loading...</p>
        ) : !reports || reports.length === 0 ? (
          <div className="fp-card border border-border bg-white p-5 text-sm text-mid">
            No reports yet. Your first annual report will appear here after HMRC reporting runs in
            January.
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </div>
        )}
      </div>

      <div className="fp-card border border-border bg-surface p-5 text-sm">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />
          <p className="text-mid">
            Your consent to this collection was given when you accepted the FeastPot vendor terms
            (clause 7.2). If you have questions about how we handle your tax data, contact{' '}
            <a href={`mailto:${PLATFORM_FACTS.contact.complianceEmail}`} className="underline hover:text-teal">
              {PLATFORM_FACTS.contact.complianceEmail}
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Verification banner ──────────────────────────────────────────────────────

function VerificationBanner({ profile }: { profile: VendorTaxProfile | null | undefined }) {
  if (!profile) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-amber-900">Tax information required</p>
          <p className="mt-0.5 text-sm text-amber-800">
            You must complete your tax information before your listing can go live. Fill in the form
            below to get started.
          </p>
        </div>
      </div>
    );
  }

  if (profile.verificationStatus === 'FAILED') {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-red-900">Tax information update required</p>
          <p className="mt-0.5 text-sm text-red-800">
            Our compliance team could not verify your tax information. Please review and update the
            details below, or contact{' '}
            <a href={`mailto:${PLATFORM_FACTS.contact.complianceEmail}`} className="underline">
              {PLATFORM_FACTS.contact.complianceEmail}
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  if (profile.verificationStatus === 'VERIFIED') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden />
        <p className="text-sm font-semibold text-green-900">
          Tax information verified
          {profile.verifiedAt
            ? ` on ${new Date(profile.verifiedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="h-4 w-4 shrink-0 rounded-full bg-amber-400" aria-hidden />
      <p className="text-sm text-amber-900">Your tax information is awaiting review by our compliance team.</p>
    </div>
  );
}

// ─── Tax profile section (view + edit) ───────────────────────────────────────

function TaxProfileSection({ profile }: { profile: VendorTaxProfile | null | undefined }) {
  const [editing, setEditing] = useState(!profile);
  const prefill = usePrefillFromStripe();
  const upsert = useUpsertTaxProfile();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState<UpsertTaxProfileInput>({
    entityType: profile?.entityType ?? 'SOLE_TRADER',
    legalName: profile?.legalName ?? '',
    tradingName: profile?.tradingName ?? '',
    addressLine1: profile?.addressLine1 ?? '',
    addressLine2: profile?.addressLine2 ?? '',
    city: profile?.city ?? '',
    postcode: profile?.postcode ?? '',
    country: profile?.country ?? 'GB',
    dateOfBirth: profile?.dateOfBirth?.slice(0, 10) ?? '',
    companyNumber: profile?.companyNumber ?? '',
    taxIdentifier: profile?.taxIdentifier ?? '',
    taxIdCountry: profile?.taxIdCountry ?? 'GB',
    vatNumber: profile?.vatNumber ?? '',
  });

  const field = (k: keyof UpsertTaxProfileInput) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const statusBadge = profile ? STATUS_BADGE[profile.verificationStatus] : null;

  if (!editing && profile) {
    return (
      <section className="fp-card border border-border bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-dark">Your details</h2>
          <div className="flex items-center gap-2">
            {statusBadge && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge.cls}`}>
                {statusBadge.label}
              </span>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-semibold text-teal underline hover:no-underline"
            >
              Edit
            </button>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {[
            ['Entity type', ENTITY_TYPES.find((e) => e.value === profile.entityType)?.label ?? profile.entityType],
            ['Legal name', profile.legalName],
            ['Trading name', profile.tradingName ?? '-'],
            ['Address', [profile.addressLine1, profile.addressLine2, profile.city, profile.postcode].filter(Boolean).join(', ')],
            ['Country', profile.country],
            profile.dateOfBirth ? ['Date of birth', new Date(profile.dateOfBirth).toLocaleDateString('en-GB')] : null,
            profile.companyNumber ? ['Company number', profile.companyNumber] : null,
            ['Tax identifier (UTR/NI)', profile.taxIdentifier ?? 'Not provided'],
            profile.vatNumber ? ['VAT number', profile.vatNumber] : null,
          ]
            .filter((x): x is [string, string] => x !== null)
            .map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-mid">{label as string}</dt>
                <dd className="mt-0.5 font-medium text-dark">{value as string}</dd>
              </div>
            ))}
        </dl>
        <p className="mt-4 text-[11px] text-mid">
          Last updated: {new Date(profile.updatedAt).toLocaleDateString('en-GB')}
        </p>
      </section>
    );
  }

  return (
    <section className="fp-card border border-border bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-dark">
          {profile ? 'Edit your details' : 'Enter your tax details'}
        </h2>
        <button
          type="button"
          onClick={() => {
            prefill.mutate(undefined, {
              onSuccess: (p) => {
                setForm({
                  entityType: p.entityType,
                  legalName: p.legalName,
                  tradingName: p.tradingName ?? '',
                  addressLine1: p.addressLine1,
                  addressLine2: p.addressLine2 ?? '',
                  city: p.city,
                  postcode: p.postcode,
                  country: p.country,
                  dateOfBirth: p.dateOfBirth?.slice(0, 10) ?? '',
                  companyNumber: p.companyNumber ?? '',
                  taxIdentifier: p.taxIdentifier ?? '',
                  taxIdCountry: p.taxIdCountry,
                  vatNumber: p.vatNumber ?? '',
                });
              },
              onError: (err) => setError(err instanceof Error ? err.message : 'Could not import from Stripe'),
            });
          }}
          disabled={prefill.isPending}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-dark hover:bg-border disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${prefill.isPending ? 'animate-spin' : ''}`} aria-hidden />
          Import from Stripe
        </button>
      </div>

      <p className="mt-1 text-xs text-mid">
        Click &quot;Import from Stripe&quot; to pre-fill fields from your Stripe account. Only
        missing fields will be updated.
      </p>

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setSuccess(false);
          const payload: UpsertTaxProfileInput = {
            ...form,
            tradingName: form.tradingName || undefined,
            addressLine2: form.addressLine2 || undefined,
            dateOfBirth: form.dateOfBirth || undefined,
            companyNumber: form.companyNumber || undefined,
            taxIdentifier: form.taxIdentifier || undefined,
            vatNumber: form.vatNumber || undefined,
          };
          upsert.mutate(payload, {
            onSuccess: () => {
              setSuccess(true);
              setEditing(false);
            },
            onError: (err) => setError(err instanceof Error ? err.message : 'Save failed'),
          });
        }}
      >
        <div>
          <label className="label-xs">Entity type *</label>
          <select value={form.entityType} onChange={field('entityType')} className="fp-input mt-1 w-full">
            {ENTITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-xs">Legal name *</label>
            <input type="text" value={form.legalName} onChange={field('legalName')} required className="fp-input mt-1 w-full" placeholder="As registered with HMRC" />
          </div>
          <div>
            <label className="label-xs">Trading name</label>
            <input type="text" value={form.tradingName} onChange={field('tradingName')} className="fp-input mt-1 w-full" placeholder="If different from legal name" />
          </div>
        </div>

        <div>
          <label className="label-xs">Address line 1 *</label>
          <input type="text" value={form.addressLine1} onChange={field('addressLine1')} required className="fp-input mt-1 w-full" />
        </div>
        <div>
          <label className="label-xs">Address line 2</label>
          <input type="text" value={form.addressLine2} onChange={field('addressLine2')} className="fp-input mt-1 w-full" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-xs">City *</label>
            <input type="text" value={form.city} onChange={field('city')} required className="fp-input mt-1 w-full" />
          </div>
          <div>
            <label className="label-xs">Postcode *</label>
            <input type="text" value={form.postcode} onChange={field('postcode')} required className="fp-input mt-1 w-full" />
          </div>
        </div>

        {form.entityType === 'SOLE_TRADER' && (
          <div>
            <label className="label-xs">Date of birth * <span className="text-mid font-normal">(required for sole traders under SI 2023/817)</span></label>
            <input type="date" value={form.dateOfBirth} onChange={field('dateOfBirth')} required className="fp-input mt-1 w-full" />
          </div>
        )}

        {form.entityType === 'LIMITED_COMPANY' && (
          <div>
            <label className="label-xs">Companies House number * <span className="text-mid font-normal">(required for limited companies)</span></label>
            <input type="text" value={form.companyNumber} onChange={field('companyNumber')} required className="fp-input mt-1 w-full" placeholder="e.g. 12345678" maxLength={8} />
          </div>
        )}

        <div>
          <label className="label-xs">Unique Taxpayer Reference (UTR) or NI number</label>
          <input type="text" value={form.taxIdentifier} onChange={field('taxIdentifier')} className="fp-input mt-1 w-full" placeholder="10-digit UTR or NI number" maxLength={20} />
          <p className="mt-1 text-[11px] text-mid">Your UTR is on any HMRC correspondence. Find it at{' '}
            <a href="https://www.gov.uk/find-utr-number" target="_blank" rel="noreferrer" className="underline">
              gov.uk
              <ExternalLink className="inline h-3 w-3 ml-0.5" aria-hidden />
            </a>.
          </p>
        </div>

        <div>
          <label className="label-xs">VAT number (if VAT registered)</label>
          <input type="text" value={form.vatNumber} onChange={field('vatNumber')} className="fp-input mt-1 w-full" placeholder="GB123456789" maxLength={15} />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Saved. Your information is pending review by our compliance team.
          </div>
        )}

        <div className="flex gap-3 pt-1">
          {profile && (
            <button type="button" onClick={() => setEditing(false)} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-dark hover:bg-surface">
              Cancel
            </button>
          )}
          <button type="submit" disabled={upsert.isPending} className="flex-1 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
            {upsert.isPending ? 'Saving...' : 'Save tax information'}
          </button>
        </div>
      </form>
    </section>
  );
}

// ─── Annual report card ───────────────────────────────────────────────────────

function ReportCard({ report }: { report: PlatformReport }) {
  const [expanded, setExpanded] = useState(false);
  const quarters = ['q1', 'q2', 'q3', 'q4'] as const;

  return (
    <div className="fp-card border border-border bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-dark">{report.reportingYear} Annual Report</p>
          <p className="text-xs text-mid">
            {report.orderCount} transactions &middot; {formatPounds(report.grossPence)} gross
            {report.copySentAt
              ? ` &middot; copy sent ${new Date(report.copySentAt).toLocaleDateString('en-GB')}`
              : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-teal"
          aria-expanded={expanded}
        >
          {expanded ? 'Hide' : 'Details'}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-mid">Gross consideration</dt>
              <dd className="font-medium text-dark">{formatPounds(report.grossPence)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-mid">Fees deducted</dt>
              <dd className="font-medium text-dark">{formatPounds(report.feesPence)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-mid">Transactions</dt>
              <dd className="font-medium text-dark">{report.orderCount}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-mid">Reported to HMRC</dt>
              <dd className="font-medium text-dark">
                {report.reportedAt
                  ? new Date(report.reportedAt).toLocaleDateString('en-GB')
                  : 'Not yet'}
              </dd>
            </div>
          </dl>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mid">Quarterly breakdown</p>
            <div className="grid grid-cols-4 gap-2">
              {quarters.map((q) => {
                const data = report.quarterlyBreakdown[q];
                if (!data) return null;
                return (
                  <div key={q} className="rounded-md bg-surface px-3 py-2 text-xs">
                    <p className="font-semibold text-dark">{q.toUpperCase()}</p>
                    <p className="text-mid">{formatPounds(data.grossPence)}</p>
                    <p className="text-mid">{data.orderCount} orders</p>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-mid">
            <Download className="h-3.5 w-3.5" aria-hidden />
            A copy of this report was sent to your registered email address
            {report.copySentAt
              ? ` on ${new Date(report.copySentAt).toLocaleDateString('en-GB')}`
              : ' (pending)'}
            .
          </p>
        </div>
      )}
    </div>
  );
}

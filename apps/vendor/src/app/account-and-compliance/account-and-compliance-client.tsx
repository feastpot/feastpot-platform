'use client';

import { FileCheck2, Gavel, ScrollText } from 'lucide-react';

import { AccountStatusClient } from '../account-status/account-status-client';
import { ComplianceClient, type VerificationRecord } from '../compliance/compliance-client';
import type { VendorComplianceStatus } from '../compliance/compliance-client';
import { TermsClient } from '../terms/terms-client';

// ── Types re-exported for the server page ────────────────────────────────────

export interface TermsVersion {
  id: string;
  documentType: string;
  version: string;
  summary: string;
  publishedAt: string;
  effectiveAt: string;
  accepted: boolean;
}

export interface TermsHistoryEntry extends Omit<TermsVersion, 'accepted'> {
  acceptedAt: string | null;
  acceptanceMethod?: string | null;
}

export interface TermsViewData {
  current: TermsVersion | null;
  pending: TermsVersion | null;
}

// ── Internal types ───────────────────────────────────────────────────────────

interface VendorSummary {
  id: string;
  businessName: string;
  status: 'pending' | 'approved' | 'live' | 'suspended' | 'probation' | 'removed';
  complianceStatus: VendorComplianceStatus;
  fsaHygieneRating: number | null;
  fsaRatingDate: string | null;
  fsaRegistrationNumber: string | null;
}

interface Props {
  vendor: VendorSummary;
  verification: VerificationRecord | null;
  termsView: TermsViewData;
  termsHistory: TermsHistoryEntry[];
}

// ── Section heading component ────────────────────────────────────────────────

function SectionHeading({
  id,
  Icon,
  title,
  description,
}: {
  id: string;
  Icon: typeof FileCheck2;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span
        aria-hidden
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-light text-teal"
      >
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 id={id} className="text-base font-extrabold tracking-tight text-dark">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-mid">{description}</p>
      </div>
    </div>
  );
}

// ── Main client component ────────────────────────────────────────────────────

/**
 * Merged client for the Account and compliance page.
 *
 * Three ordered sections:
 *   1. Standing       — enforcement actions (client-fetched, always first)
 *   2. Compliance     — FSA badge, verification record, document uploads
 *   3. Terms & notices — current/pending terms, history, rate card
 *
 * The ComplianceClient receives `embedded` so it suppresses its own page
 * heading while preserving every other behaviour (hooks, banners, doc cards).
 */
export function AccountAndComplianceClient({
  vendor,
  verification,
  termsView,
  termsHistory,
}: Props) {
  return (
    <div className="space-y-2">
      {/* Page header */}
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-dark">Account and compliance</h1>
        <p className="mt-1 text-sm text-mid">
          Your account standing, compliance certificates, and agreement with Feastpot in one place.
        </p>
      </header>

      {/* ── Section 1: Standing ─────────────────────────────────────────────── */}
      <section
        aria-labelledby="standing-heading"
        className="rounded-2xl border border-border bg-white p-5 shadow-sm"
      >
        <SectionHeading
          id="standing-heading"
          Icon={Gavel}
          title="Standing"
          description="Active enforcement actions against your listing. Most urgent shown first."
        />
        <AccountStatusClient />
      </section>

      {/* ── Section 2: Compliance ───────────────────────────────────────────── */}
      <section
        aria-labelledby="compliance-heading"
        className="rounded-2xl border border-border bg-white p-5 shadow-sm"
      >
        <SectionHeading
          id="compliance-heading"
          Icon={FileCheck2}
          title="Compliance"
          description="Your compliance certificates, verification status, and requirements checklist."
        />
        {/*
          embedded=true suppresses ComplianceClient's own <h1> page heading so
          this section heading is the only heading in this block.
        */}
        <ComplianceClient vendor={vendor} verification={verification} embedded />
      </section>

      {/* ── Section 3: Terms and notices ────────────────────────────────────── */}
      <section
        aria-labelledby="terms-heading"
        className="rounded-2xl border border-border bg-white p-5 shadow-sm"
      >
        <SectionHeading
          id="terms-heading"
          Icon={ScrollText}
          title="Terms and notices"
          description="Your current agreement with Feastpot, change history, and acknowledgement record."
        />
        <TermsClient view={termsView} history={termsHistory} />
      </section>
    </div>
  );
}

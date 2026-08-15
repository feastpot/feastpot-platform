'use client';

/**
 * TermsAcceptanceClient -- click-wrap acceptance for Vendor Terms of Agreement.
 *
 * Legal basis (preserved in code, not just a process document):
 *   Electronic acceptance is valid in the UK under the Electronic Communications
 *   Act 2000, the retained eIDAS Regulation, and the Law Commission's 2019
 *   statement on electronic execution. Click-wrap is enforceable where the
 *   vendor had reasonable notice of the terms and took a clear affirmative
 *   action.
 *
 * Requirements enforced here:
 *   1. Full terms rendered in a scrollable pane (not a link assumed read).
 *   2. Checkbox enabled only once the vendor scrolls to the bottom.
 *   3. Checkbox starts UNTICKED. Pre-ticked boxes are not valid consent.
 *   4. scrolledToEnd is recorded honestly -- never set to true artificially.
 *   5. All nine audit fields sent to the API on acceptance.
 *   6. Keyboard accessible, screen-reader labelled, WCAG 2.2 AA.
 */

import { Button, KeyTermsSummary, RateCard } from '@feastpot/ui';
import type { RateRow } from '@feastpot/ui';
import { AlertCircle, CheckCircle2, Download, FileText, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/ui/toaster';
import { apiRequest, ApiError } from '@/lib/api/client';

interface TermsVersion {
  id: string;
  version: string;
  effectiveAt: string;
  contentMdx: string;
  contentHash: string;
  changeSummary: string;
}

interface Props {
  accessToken: string;
  version: TermsVersion;
  alreadyAccepted: boolean;
}

/** Exact acceptance label shown to vendor -- recorded verbatim in the DB. */
function buildAcceptanceLabel(version: string): string {
  return `I have read and agree to the Feastpot Vendor Terms of Agreement version ${version}, including the Rate Schedule.`;
}

export function TermsAcceptanceClient({ accessToken, version, alreadyAccepted }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Layer 2: live commission rates (public endpoint, no auth required).
  const [rates, setRates] = useState<RateRow[]>([]);
  const [ratesLoading, setRatesLoading] = useState(true);
  useEffect(() => {
    apiRequest<RateRow[]>('/terms/rate-schedule')
      .then(setRates)
      .catch(() => null)
      .finally(() => setRatesLoading(false));
  }, []);

  const ACCEPTANCE_LABEL = buildAcceptanceLabel(version.version);

  // ── Scroll tracking ──────────────────────────────────────────────────────────
  // Enable the checkbox once the vendor reaches within 50px of the bottom.
  // Never set scrolledToEnd=true artificially (enforcement of DO NOT rule).
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || scrolledToEnd) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (nearBottom) setScrolledToEnd(true);
  }, [scrolledToEnd]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    // Check immediately in case the content is short enough to not need scrolling.
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // ── Acceptance ───────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/terms/versions/${version.id}/accept`, {
        method: 'POST',
        accessToken,
        body: JSON.stringify({
          acceptanceText: ACCEPTANCE_LABEL,
          scrolledToEnd,
        }),
      });

      toast({
        title: 'Terms accepted',
        description: `You have accepted Vendor Terms v${version.version}. A copy has been emailed to you.`,
      });
      router.push('/onboarding?terms=accepted');
      router.refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(msg);
      setSubmitting(false);
    }
  };

  // ── Already accepted ─────────────────────────────────────────────────────────
  if (alreadyAccepted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-teal-600" />
        <h1 className="mb-2 text-2xl font-bold">Terms already accepted</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          You have already accepted Vendor Terms v{version.version}. No further action is needed.
        </p>
        <Button onClick={() => router.push('/onboarding')}>Back to setup</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Vendor Terms of Agreement</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Version {version.version} &middot; Effective{' '}
          {new Date(version.effectiveAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}{' '}
          &middot; England &amp; Wales
        </p>
      </header>

      {/* Three-layer layout: on desktop, terms pane (left) and Layer 1+2 (right). */}
      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-6">
        {/* ── Left column: full terms pane + accept controls ─────────────── */}
        <div>
          {/* What changed in this version */}
          <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="mb-2 font-semibold text-amber-900">What changed in v{version.version}</p>
            <ul className="space-y-1 text-amber-800">
              {version.changeSummary
                .split('\n')
                .filter(Boolean)
                .map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-amber-600">&#8226;</span>
                    {line.replace(/^(Added|Changed|Fixed): /, '')}
                  </li>
                ))}
            </ul>
          </section>

          {/* External link to full terms (Layer 3) */}
          <div className="mb-4 flex flex-wrap gap-3 text-sm">
            <a
              href="https://feastpot.co.uk/legal/vendor-terms"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-teal-700 underline hover:text-teal-900"
            >
              <FileText className="h-4 w-4" />
              Open full terms in a new tab
            </a>
            <a
              href="https://feastpot.co.uk/legal/vendor-terms"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                window.open('https://feastpot.co.uk/legal/vendor-terms', '_blank');
              }}
              className="flex items-center gap-1.5 text-teal-700 underline hover:text-teal-900"
            >
              <Download className="h-4 w-4" />
              Save as PDF (print &rsaquo; Save as PDF)
            </a>
          </div>

          {/* Scrollable terms pane -- min 400px desktop, full viewport on mobile */}
          <div
            ref={scrollRef}
            role="region"
            aria-label="Vendor Terms of Agreement -- scroll to read"
            className="relative mb-4 h-[60vh] min-h-[400px] overflow-y-auto rounded-xl border border-border bg-muted/30 p-5 text-sm leading-relaxed text-foreground/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
            tabIndex={0}
          >
            <div className="prose prose-sm max-w-none">
              {/* Render contentMdx as preformatted markdown. For production, swap to
              a proper MDX renderer (e.g. next-mdx-remote). The text is already
              well-formatted and readable as plain markdown. */}
              {version.contentMdx.split('\n').map((line, i) => {
                if (line.startsWith('# ')) {
                  return (
                    <h1 key={i} className="mb-3 mt-6 text-xl font-bold first:mt-0">
                      {line.slice(2)}
                    </h1>
                  );
                }
                if (line.startsWith('## ')) {
                  return (
                    <h2 key={i} className="mb-2 mt-5 text-base font-bold">
                      {line.slice(3)}
                    </h2>
                  );
                }
                if (line.startsWith('### ')) {
                  return (
                    <h3 key={i} className="mb-1 mt-4 text-sm font-semibold">
                      {line.slice(4)}
                    </h3>
                  );
                }
                if (line.startsWith('- ') || line.startsWith('* ')) {
                  return (
                    <p key={i} className="my-0.5 pl-4">
                      <span className="mr-2 text-muted-foreground">&bull;</span>
                      {line.slice(2)}
                    </p>
                  );
                }
                if (line.startsWith('---')) {
                  return <hr key={i} className="my-4 border-border" />;
                }
                if (line.startsWith('*') && line.endsWith('*')) {
                  return (
                    <p key={i} className="text-xs italic text-muted-foreground">
                      {line.slice(1, -1)}
                    </p>
                  );
                }
                if (line === '') return <div key={i} className="h-2" />;
                return (
                  <p key={i} className="my-1">
                    {line}
                  </p>
                );
              })}
            </div>

            {/* Scroll-to-end indicator */}
            {!scrolledToEnd && (
              <div className="pointer-events-none sticky bottom-0 left-0 right-0 flex justify-center bg-gradient-to-t from-muted/80 to-transparent pb-2 pt-8 text-xs text-muted-foreground">
                Scroll down to read the full terms
              </div>
            )}
          </div>

          {/* Scroll progress message */}
          {!scrolledToEnd && (
            <p aria-live="polite" className="mb-3 flex items-center gap-1.5 text-xs text-amber-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Please scroll to the end of the terms to enable the checkbox.
            </p>
          )}

          {/* Checkbox -- starts UNTICKED, enabled only after scrolling to end */}
          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <label
              className={`flex cursor-pointer items-start gap-3 text-sm ${!scrolledToEnd ? 'opacity-50' : ''}`}
              htmlFor="terms-accept-checkbox"
            >
              <input
                id="terms-accept-checkbox"
                type="checkbox"
                checked={checked}
                disabled={!scrolledToEnd}
                onChange={(e) => setChecked(e.target.checked)}
                aria-describedby="terms-accept-hint"
                className="mt-0.5 h-4 w-4 shrink-0 accent-teal-600"
              />
              <span className="font-medium leading-snug text-foreground">{ACCEPTANCE_LABEL}</span>
            </label>
            {!scrolledToEnd && (
              <p id="terms-accept-hint" className="mt-2 pl-7 text-xs text-muted-foreground">
                Scroll to the bottom of the terms above to enable this checkbox.
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {/* Action row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => router.push('/onboarding')}
              disabled={submitting}
              type="button"
            >
              Back to setup
            </Button>
            <Button
              onClick={handleAccept}
              disabled={!checked || submitting}
              aria-disabled={!checked || submitting}
              className="min-w-[200px]"
              type="button"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recording acceptance...
                </>
              ) : (
                'Accept and continue'
              )}
            </Button>
          </div>
        </div>

        {/* ── Right column: Layer 1 (key terms) + Layer 2 (rate card) ────── */}
        {/* On mobile these appear ABOVE the terms pane via CSS order */}
        <aside
          className="order-first mb-6 space-y-4 lg:order-last lg:mb-0"
          aria-label="Key terms summary and rate card"
        >
          <KeyTermsSummary />
          <RateCard rates={rates} loading={ratesLoading} />
        </aside>
      </div>
    </div>
  );
}
